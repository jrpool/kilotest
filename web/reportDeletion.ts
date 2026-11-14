/*
  reportDeletion.ts
  Shared implementation of the forms for deleting reports.
*/

// IMPORTS

import {
  errorMessage,
  getReport,
  getReportPageID,
  isReportError,
  isValidAuthCode,
  htmlSafe,
  objectSort,
  populateTemplate,
  readdirOrCreate,
  reportsPath
} from '../util.ts';
import {
  getReportData
} from './util.ts';
import {getPageTitle, getRegistry} from '../registry.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// TYPES

// A summary of an available report, as shown in a deletion form.
type ReportSpec = {
  id: string;
  issueCount: number;
  preventedEngineCount: number;
  // What the report is about: the identifier of its page, or, if it has none, its URL. Reports about one page have one target even if the URL of the page was revised between them.
  target: string;
  // The identifier of the page of the report, or an empty string if it has none.
  pageID: string;
  // The site and page names under which the page was tested.
  title: string;
  // The URL by which the report is ordered: the registered URL of its page, or, if the page is not registered, its own URL.
  sortURL: string;
  url: string;
};

// The distinctive properties of a report-deletion form.
export type DeletionSpec = {
  intro: string;
  emptyIntro: string;
  failurePrefix: string;
  isDeletable: (specs: ReportSpec[], index: number) => boolean;
};

// FUNCTIONS

// Returns a form for deleting the reports that the predicate marks as deletable. The form
// shows only the targets with any deletable report, each as a group of all the reports
// about it with its current registration and the registration under which each report was
// made, so that the manager can see what a deletion would leave. A GET
// request never processes a submission, regardless of its query string; only a POST
// request (the form's own submission) does. A submission naming any report that is not
// deletable when submitted deletes nothing and is answered with the form and a message.
export const reportDeletionForm = async (
  dirName: string,
  search: string,
  method: string,
  deletionSpec: DeletionSpec
): Promise<{status: string; message?: string; answerPage?: string}> => {
  const {emptyIntro, failurePrefix, intro, isDeletable} = deletionSpec;
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const jobNames = searchParams?.getAll('report');
  const registry = await getRegistry();
  // Returns summaries of the available reports, ordered so that the reports about each target are adjacent and chronological, or an error object if any report cannot be used.
  const getReportSpecs = async (): Promise<ReportSpec[] | {error: string}> => {
    const reportNames = await readdirOrCreate(reportsPath(), 'Reports directory');
    const reportSpecs: ReportSpec[] = [];
    // For each report:
    for (const reportName of reportNames) {
      const reportID = reportName.slice(0, -5);
      // Get the report.
      const report = await getReport(reportID);
      // If this failed:
      if (isReportError(report)) {
        // Return why.
        return {error: report.error};
      }
      // Otherwise, i.e. if it succeeded, get a summary of it.
      const {issueCount, preventedEngineCount, url} = getReportData(report);
      const pageID = getReportPageID(report);
      const {siteName, pageName} = (report as {sources?: {siteName?: string; pageName?: string}}).sources ?? {};
      // Add the summary to the array.
      reportSpecs.push({
        id: reportID,
        issueCount,
        preventedEngineCount,
        target: pageID || url,
        pageID,
        title: siteName && pageName ? `${siteName} ${pageName}` : report.target.what,
        sortURL: registry.pages[pageID]?.url ?? url,
        url
      });
    }
    // Sort the summaries by URL, then target, and then report identifier.
    objectSort(reportSpecs, 'id', 'alpha');
    objectSort(reportSpecs, 'target', 'alpha');
    objectSort(reportSpecs, 'sortURL', 'alpha');
    return reportSpecs;
  };
  let reportSpecs = await getReportSpecs();
  // If any report cannot be used:
  if ('error' in reportSpecs) {
    // Return why.
    return {status: 'error', message: reportSpecs.error};
  }
  let notice = '';
  // If the form has been submitted and any reports are to be deleted:
  if (method === 'POST' && jobNames?.length) {
    // If the authorization code is invalid:
    if (!isValidAuthCode(authCode)) {
      // Report the error, deliberately vague so as not to confirm to an attacker that the
      // authorization code specifically (as opposed to some other part of the request) is
      // what was wrong.
      return {
        status: 'error',
        message: 'Invalid request'
      };
    }
    const specs = reportSpecs;
    // Get the identifiers of the reports that are deletable now. Deletability is checked again here, not only when the form is displayed, because the reports may have changed since then (e.g. if another manager, or another deletion form, has deleted or added a report), so that a report that was deletable when displayed may no longer be.
    const deletableIDs = new Set(specs.filter((_, index) => isDeletable(specs, index)).map(spec => spec.id));
    const undeletableID = jobNames.find(jobName => !deletableIDs.has(jobName));
    // If any report to be deleted is not deletable:
    if (undeletableID !== undefined) {
      // Delete none, and prepare to say why.
      notice = `Nothing was deleted, because report ${undeletableID} is not deletable with this form. It may have been deleted, or the reports about its page may have changed, since the form was displayed.`;
    }
    // Otherwise, i.e. if they are all deletable:
    else {
      try {
        // For each report to be deleted:
        for (const jobName of jobNames) {
          // Delete it.
          await fs.unlink(path.join(reportsPath(), `${jobName}.json`));
        }
      }
      // If this failed:
      catch (error: unknown) {
        // Return why.
        return {
          status: 'error',
          message: `${failurePrefix} (${errorMessage(error)})`
        };
      }
      // Get summaries of the remaining reports, which were all usable before the deletion.
      reportSpecs = await getReportSpecs() as ReportSpec[];
    }
  }
  const remainingSpecs = reportSpecs;
  // Group the summaries by target, noting which reports are deletable.
  const groups = new Map<string, {spec: ReportSpec; deletable: boolean}[]>();
  remainingSpecs.forEach((spec, index) => {
    const group = groups.get(spec.target) ?? [];
    group.push({spec, deletable: isDeletable(remainingSpecs, index)});
    groups.set(spec.target, group);
  });
  const lines: string[] = [];
  const margin = ' '.repeat(8);
  // For each target with any deletable report (the other targets being omitted as irrelevant):
  for (const group of [...groups.values()].filter(items => items.some(item => item.deletable))) {
    const {pageID} = (group[0] as {spec: ReportSpec}).spec;
    const page = registry.pages[pageID];
    // Add a group of all the reports about it, so that the manager can compare them, labeled with its page identifier and showing its current registration, which may differ from those in its reports.
    lines.push(
      `${margin}<fieldset>`,
      `${margin}  <legend>${pageID ? `page <code>${pageID}</code>` : 'page with no identifier'}</legend>`,
      `${margin}  <p>${page
        ? `Now registered as “${htmlSafe(getPageTitle(registry, pageID, ''))}” at <code>${htmlSafe(page.url)}</code>.`
        : 'Not now registered.'}</p>`
    );
    // For each report in the group:
    for (const {spec, deletable} of group) {
      const {id, issueCount, preventedEngineCount, title, url} = spec;
      const specString = `<code>${id}</code>: tested as “${htmlSafe(title)}” at <code>${htmlSafe(url)}</code>; preventions ${preventedEngineCount}, issues ${issueCount}`;
      // Add a line about it, with a deletion checkbox if and only if it is deletable.
      lines.push(deletable
        ? `${margin}  <p><label><input type="checkbox" name="report" value="${id}"> ${specString}</label></p>`
        : `${margin}  <p>${specString}</p>`);
    }
    lines.push(`${margin}</fieldset>`);
  }
  const anyDeletable = lines.length > 0;
  const query: Record<string, string> = {
    reports: lines.join('\n'),
    notice: notice ? `      <p role="alert"><strong>${htmlSafe(notice)}</strong></p>` : '',
    intro: anyDeletable ? intro : emptyIntro,
    disabled: anyDeletable ? '' : 'disabled'
  };
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(dirName, query)
  };
};
