/*
  index.ts
  Dispatches requests of the Testaro worker interface: job assignment and report
  acquisition, plus the job lifecycle they drive.
*/

// IMPORTS

/* c8 ignore start */
// c8 intermittently reports import lines as uncovered due to a range-merge
// artifact in its remapping of Node's type-stripped source.
import {
  annotateReportObject,
  createLock,
  errorMessage,
  getJobNames,
  getJSON,
  getObject,
  getReportPath,
  isAllowedRedirectTarget,
  isAllowedReport,
  isReportID,
  isUsableReport,
  jobsPath
} from '../util.ts';
import {sendAlert} from '../alerts.ts';
import {checkBalancesForAlerts} from '../balances.ts';
import {getAbuseError, serveError} from '../requestKit.ts';
import {removeOrphans} from '../testRequests.ts';
import fs from 'node:fs/promises';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'node:path';
import type {Report} from 'testaro';
/* c8 ignore stop */

// CONSTANTS

// Paths of the job-state directories.
export const queuePath = () => path.join(jobsPath(), 'queue');
export const claimedPath = () => path.join(jobsPath(), 'claimed');
export const failedPath = () => path.join(jobsPath(), 'failed');
const jobLock = createLock();

// TYPES

// The properties of a job that Kilotest reads or alters between its creation and
// its completion or failure; its other properties are Testaro's and pass through
// untouched.
type ManagedJob = {
  id: string;
  browserID?: string;
  target: {what: string; url: string};
  sources: {worker?: string; browsersTried?: string[]} & Record<string, unknown>;
};

// CONSTANTS

// The browser types, in the order a job that has failed is retried with before it
// is classified as failed. A failure can be specific to the browser engine used:
// the edge protection of a target may reset the connections of some engines, and
// a page may crash one engine but not another. Each type is therefore tried once
// before a failure is accepted.
const browserRetryOrder = ['chromium', 'webkit', 'firefox'];

// FUNCTIONS

// Reclassifies a job in a directory as failed, and then removes the registrations of any page left with no report or job (as a page whose first job fails is) and of any site left with no page.
const failJob = async (dirPath: string, jobFileName: string): Promise<void> => {
  await fs.rename(path.join(dirPath, jobFileName), path.join(failedPath(), jobFileName));
  await removeOrphans();
};
// Reclassifies a defective job — one with no browser type, although every job is
// created as a modified copy of job.json, which specifies one — as failed, and
// alerts the maintainer by email, since the defect indicates corruption that
// should never occur.
const failDefectiveJob = async (dirPath: string, jobFileName: string, job: ManagedJob): Promise<void> => {
  await sendAlert(
    'Kilotest: defective job failed',
    `Job ${job.id} (${job.target.what}) has no browser type, although every job is created as a modified copy of job.json, which specifies one. The job was reclassified as failed.`
  );
  await failJob(dirPath, jobFileName);
};
// Requeues a job for a retry under the first browser type in the retry order that
// it has not already used, and returns that type. Returns 'defective' if the job
// has no browser type, since it is then defective and cannot be retried, or null
// if it has used every type. The job keeps its identifier, which is also the
// identifier under which its report is announced to the requester and eventually
// saved. The types already used are recorded in sources.browsersTried, a property
// Testaro does not read or alter (like sources.worker, which the requeue removes,
// since the retry is unassigned).
const requeueJob = async (dirPath: string, jobFileName: string, job: ManagedJob): Promise<string | 'defective' | null> => {
  if (!job.browserID) {
    return 'defective';
  }
  const tried = job.sources.browsersTried ?? [job.browserID];
  const nextBrowserID = browserRetryOrder.find(id => !tried.includes(id));
  if (!nextBrowserID) {
    return null;
  }
  job.browserID = nextBrowserID;
  job.sources = {...job.sources, browsersTried: [...tried, nextBrowserID]};
  delete job.sources.worker;
  // The job is written to the queue before any removal from its current
  // directory, so a failure during the move cannot lose it.
  await fs.writeFile(path.join(queuePath(), jobFileName), getJSON(job));
  if (dirPath !== queuePath()) {
    await fs.unlink(path.join(dirPath, jobFileName));
  }
  return nextBrowserID;
};
// Gets the ID and secret from a request's HTTP Basic Authorization header, or null if the header
// is absent or malformed.
const getBasicAuth = (request: IncomingMessage) => {
  const header = request.headers['authorization'] || '';
  const match = header.match(/^Basic\s+(\S+)$/i);
  if (!match) {
    return null;
  }
  const decoded = Buffer.from(match[1]!, 'base64').toString('utf8');
  const sepIndex = decoded.indexOf(':');
  if (sepIndex === -1) {
    return null;
  }
  return {id: decoded.slice(0, sepIndex), secret: decoded.slice(sepIndex + 1)};
};
// Returns the credentials of the Testaro workers, by worker ID, from a JSON-object
// environment variable. Each worker ID maps to a secret (used only to authenticate the worker,
// never published) and a name (a non-secret label safe to publish, e.g. in report data and logs).
const getWorkerCredentials = () => {
  try {
    return JSON.parse(process.env.TESTARO_WORKERS || '{}');
  }
  catch (error) {
    console.error(`ERROR: TESTARO_WORKERS is not valid JSON (${errorMessage(error)})`);
    return {};
  }
};
// Gets the published name of a Testaro worker or null if not authenticated.
const getAuthorizedWorkerName = (request: IncomingMessage) => {
  const credentials = getBasicAuth(request);
  if (credentials) {
    const workerCredentials = getWorkerCredentials();
    const worker = workerCredentials[credentials.id];
    if (worker && worker.secret === credentials.secret && worker.name) {
      return worker.name;
    }
  }
  return null;
};
// Processes a job request from a Testaro worker.
const processJobRequest = async (request: IncomingMessage, response: ServerResponse, workerName: string) => jobLock(async () => {
  let clean = true;
  const messageStart = `Testaro worker ${workerName} requested a job, `;
  const jobNames = await getJobNames();
  const claimedJobNames = jobNames.claimed;
  // For each claimed job:
  for (const jobName of claimedJobNames) {
    // A claimed-job file can disappear between the directory listing above and this
    // read, because report submission (which deletes or reclassifies claimed jobs) is
    // not serialized by jobLock. That race is a normal, recoverable condition, so the
    // job is skipped rather than treated as defective; any other failure to read it
    // should never occur and is left to propagate.
    let job: unknown;
    try {
      job = await getObject(path.join(jobsPath(), 'claimed', jobName));
    }
    catch (error: unknown) {
      if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    const {id, sources} = job as {id: string, sources: {worker: string}};
    const {worker} = sources;
    // If its assignee is the worker:
    if (worker === workerName) {
      const messageEnd = `but has not completed job ${id}`;
      // Report this.
      await serveError({message: `${messageStart}${messageEnd}`}, response, false);
      // Retry the job under the next untried browser type, or reclassify it as
      // failed if all types have been tried or it is defective: an abandoned job
      // may have failed only under the engine it was assigned (e.g. a crash on
      // the target).
      const retriedBrowserID = await requeueJob(claimedPath(), jobName, job as ManagedJob);
      if (retriedBrowserID === 'defective') {
        await failDefectiveJob(claimedPath(), jobName, job as ManagedJob);
      }
      else if (retriedBrowserID) {
        console.log(`Job ${id} is being retried with ${retriedBrowserID}`);
      }
      else {
        await failJob(claimedPath(), jobName);
      }
      clean = false;
      // Stop checking claimed jobs.
      break;
    }
  }
  // If no aborted-job error was found for the worker:
  if (clean) {
    const queuedJobNames = jobNames.queue;
    // If any jobs are queued:
    if (queuedJobNames.length) {
      const oldestJobName = queuedJobNames[0]!;
      // Get the first one.
      const firstJob = await getObject(path.join(queuePath(), oldestJobName)) as ManagedJob;
      // If the job's target is no longer allowed, whether because its host now resolves
      // to a disallowed address or, more likely, because the host now redirects to one
      // (both possible if the target host was reconfigured, e.g. by an attacker, after
      // the request was accepted; a fetch-based check is used, rather than the cheaper
      // DNS-only isAllowedTarget, because this runs only when a job is actually queued,
      // which is rare, and a redirect introduced after acceptance is the likelier attack):
      if (!(await isAllowedRedirectTarget(firstJob.target.url))) {
        console.error(`ERROR: Queued job ${firstJob.id} is on a target this deployment does not allow`);
        // Requeue the job under the next untried browser type, if one remains: the
        // check also fails on any fetch error, so a rejection that is transient
        // (e.g. an intermittent reset by the edge protection of the target) can be
        // healed by the re-check a retried job gets when it reaches the head of
        // the queue again. A persistently disallowed target consumes one retry
        // per assignment attempt, so the rechecks are bounded.
        const retriedBrowserID = await requeueJob(queuePath(), oldestJobName, firstJob);
        // If the job is defective:
        if (retriedBrowserID === 'defective') {
          await failDefectiveJob(queuePath(), oldestJobName, firstJob);
        }
        // Otherwise, if no browser type remains untried:
        else if (!retriedBrowserID) {
          // Alert a manager, since this indicates an attempted or accidental SSRF
          // rather than an ordinary usability problem with the target.
          await sendAlert(
            'Kilotest: queued job on disallowed target rejected',
            `Job ${firstJob.id} (${firstJob.target.what}) was never assigned to a worker because its target no longer resolves, directly or via a redirect, to an address this deployment allows (e.g. a private, loopback, or link-local address). The job was reclassified as failed.`
          );
          // Reclassify the job as failed, instead of assigning it or leaving it queued.
          await failJob(queuePath(), oldestJobName);
        }
        else {
          console.log(`Job ${firstJob.id} is being retried with ${retriedBrowserID}`);
        }
        // Respond as if no job were queued, rather than revealing anything about the rejected job.
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify({}));
        console.log(`${messageStart}but the queued job was on a disallowed target`);
      }
      // Otherwise, i.e. if the job's target is still allowed:
      else {
        // Add the public worker name to the job, in a property Testaro does not read or alter.
        firstJob.sources.worker = workerName;
        console.log(
          `Job ${firstJob.id} (${firstJob.target.what}) is being sent to the worker.`
        );
        // Assign the job to the worker.
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify(firstJob));
        const messageEnd
        = `and job ${firstJob.id} (${firstJob.target.what}) was assigned to the worker`;
        console.log(`${messageStart}${messageEnd}`);
        // Save the job in the claimed-jobs directory.
        await fs.writeFile(
          path.join(claimedPath(), oldestJobName), getJSON(firstJob)
        );
        // Delete it from the queue.
        await fs.unlink(path.join(queuePath(), oldestJobName));
      }
    }
    // Otherwise, i.e. if no jobs are queued:
    else {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8'
      });
      // Send a no-jobs response to the worker.
      response.end(JSON.stringify({}));
      const messageEnd = 'but no job was in the queue';
      console.log(`${messageStart}${messageEnd}`);
    }
  }
});
// Handles a POST request to the worker interface: /worker/job requests a job
// assignment and /worker/report submits a report.
export const handleWorkerRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  pathTail: string,
  postData: unknown
): Promise<void> => {
  // Authenticate the worker and get its public name.
  const workerName = getAuthorizedWorkerName(request);
  // If this failed:
  if (!workerName) {
    // Report this.
    await serveError(
      {message: 'ERROR: Unauthorized worker request'}, response, false, 401
    );
    return;
  }
  // Get the requested service from the path.
  const service = pathTail;
  // If the service is job assignment:
  if (service === 'job') {
    // Process the job request as a transaction.
    await processJobRequest(request, response, workerName);
  }
  // Otherwise, if it is report acquisition:
  else if (service === 'report') {
    const {report} = postData as {report?: Report};
    const reportObj: Partial<Report> = report ?? {};
    const {id, target} = reportObj;
    const {what: description, url} = (target ?? {}) as Partial<NonNullable<Report['target']>>;
    // If the request is syntactically valid:
    if (id && isReportID(id) && description && url) {
      // Get the job the report is from. A missing claimed-job file (the job was
      // never claimed, or was already completed) is a normal outcome, handled below
      // as if the job were not assigned to this worker; any other failure to read it
      // should never occur and is left to propagate.
      let claimedJob: unknown = null;
      try {
        claimedJob = await getObject(path.join(claimedPath(), `${id}.json`));
      }
      catch (error: unknown) {
        if (!(error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT')) {
          throw error;
        }
      }
      // If the job was actually assigned to this worker:
      if (typeof claimedJob === 'object' && claimedJob !== null && (claimedJob as {sources?: {worker?: string}}).sources?.worker === workerName) {
        // If the report is on a target this deployment allows (a redirect during
        // navigation, possibly via DNS rebinding, can take a worker to a target that
        // was disallowed even though the originally submitted URL passed that check
        // at submission time):
        if (!(await isAllowedReport(reportObj))) {
          console.error(`ERROR: Report ${id} from worker ${workerName} is on a disallowed target`);
          // Alert a manager, since this indicates an attempted or accidental SSRF
          // rather than an ordinary usability problem with the report.
          await sendAlert(
            'Kilotest: report on disallowed target rejected',
            `Job ${id} from worker ${workerName} resulted in a visit to a target this deployment does not allow (e.g. a private, loopback, or link-local address), possibly via a redirect. The report was discarded and the job was reclassified as failed.`
          );
          // The job is reclassified as failed without a retry under another
          // browser type, because its browser already navigated to the
          // disallowed target, and a retry would repeat that navigation.
          // Reclassify the job as failed, instead of recording the disallowed report or
          // leaving the job claimed indefinitely.
          await failJob(claimedPath(), `${id}.json`);
          // Report the error.
          await serveError({message: `ERROR: Report ${id} is on a disallowed target`}, response, false);
        }
        // Otherwise, if the report is usable by Kilotest (as any report of an assigned job should be):
        else if (isUsableReport(reportObj)) {
          console.log(`Testaro report ${id} was received from worker ${workerName}`);
          // Add the public worker name to the report.
          report!.sources = {...report!.sources, worker: workerName};
          // Annotate the report before it is ever written, rather than writing it,
          // reading it back, annotating that copy, and writing it again: the read-back
          // could fail even though the just-written report is fine.
          await annotateReportObject(reportObj);
          // Save the annotated report.
          await fs.writeFile(getReportPath(id), getJSON(report));
          console.log(`Testaro report ${id} was annotated and saved`);
          // Check the monetary balances and send alerts if nearing exhaustion.
          await checkBalancesForAlerts(report!);
          // Delete the job.
          await fs.unlink(path.join(claimedPath(), `${id}.json`));
          console.log(`Completed job ${id} deleted`);
          // Acknowledge receipt.
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({status: 'ok'}));
          console.log(
            `Testaro report ${id} was received from Testaro worker ${workerName}`
          );
        }
        // Otherwise, i.e. if the report is not usable by Kilotest:
        else {
          console.error(`ERROR: Report ${id} from worker ${workerName} is not usable`);
          // Retry the job under the next untried browser type, if one
          // remains: an unusable report may reflect a failure specific to
          // the engine used (e.g. a navigation crash), which another
          // engine may not reproduce.
          const retriedBrowserID = await requeueJob(claimedPath(), `${id}.json`, claimedJob as ManagedJob);
          // If the job is defective:
          if (retriedBrowserID === 'defective') {
            await failDefectiveJob(claimedPath(), `${id}.json`, claimedJob as ManagedJob);
          }
          // Otherwise, if no browser type remains untried:
          else if (!retriedBrowserID) {
            // Alert a manager, since an assigned job should never produce an unusable report.
            await sendAlert(
              'Kilotest: unusable report received',
              `Job ${id} from worker ${workerName} produced a report that Kilotest cannot use. The job was reclassified as failed instead of being recorded.`
            );
            // Reclassify the job as failed, instead of recording the unusable report or
            // leaving the job claimed indefinitely.
            await failJob(claimedPath(), `${id}.json`);
          }
          else {
            console.log(`Job ${id} is being retried with ${retriedBrowserID}`);
          }
          // Report the error.
          await serveError({message: `ERROR: Report ${id} is not usable`}, response, false);
        }
      }
      // Otherwise, i.e. if the job was not assigned to this worker:
      else {
        await serveError(
          getAbuseError(
            request,
            `Worker ${workerName} submitted a report for job ${id}, which was not currently assigned to it`
          ),
          response,
          false
        );
      }
    }
    // Otherwise, i.e. if the request is syntactically invalid:
    else {
      await serveError({message: 'ERROR: Request invalid'}, response, false);
    }
  }
};
