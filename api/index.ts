/*
  index.ts
  Dispatches requests of the REST API interface: maps each /api/* service to its
  responder, its response volatility, and the argument list it expects.
*/

// IMPORTS

/* c8 ignore start */
// c8 intermittently reports import lines as uncovered due to a range-merge
// artifact in its remapping of Node's type-stripped source.
import {recordPageMetric, serveError, setHeaders} from '../requestKit.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {response as getReportAPI} from './getReport.ts';
import {response as listDiagnosesAPI} from './listDiagnoses.ts';
import {response as listIssuesAPI} from './listIssues.ts';
import {response as listPagesAPI} from './listPages.ts';
import {response as listSitesAPI} from './listSites.ts';
import {response as listViolatorsAPI} from './listViolators.ts';
import {response as requestFeatureAPI} from './requestFeature.ts';
import {response as requestRetestAPI} from './requestRetest.ts';
import {response as requestNewTestAPI} from './requestNewTest.ts';
import {response as awaitTestAPI} from './awaitTest.ts';
import {response as questionDiagnosisAPI} from './questionDiagnosis.ts';
/* c8 ignore stop */

// TYPES

// A response function of an API service.
type ApiResponder = (args: string[]) => Promise<unknown>;
// An API service: its responder, the response volatility (default 'ultra'), and
// the function building the responder's argument list from the path tail after
// the service name and the parsed request body.
type Service = {
  respond: ApiResponder;
  volatility?: string;
  args: (specs: string[], body: Record<string, unknown>) => string[];
};

// CONSTANTS

// The API services, by method and service name.
const getServices: Record<string, Service> = {
  listSites: {respond: listSitesAPI, args: () => []},
  listPages: {respond: listPagesAPI, args: specs => specs},
  listIssues: {respond: listIssuesAPI, volatility: 'high', args: specs => specs},
  listViolators: {respond: listViolatorsAPI, volatility: 'high', args: specs => specs},
  listDiagnoses: {respond: listDiagnosesAPI, volatility: 'high', args: specs => specs},
  getReport: {respond: getReportAPI, volatility: 'low', args: specs => specs}
};
const postServices: Record<string, Service> = {
  requestNewTest: {
    respond: requestNewTestAPI,
    args: (specs, {siteID = '', siteName = '', pageName, URL, reason, reviewImmediately = false}) =>
      [siteID, siteName, pageName, URL, reason, String(reviewImmediately === true)] as string[]
  },
  requestRetest: {
    respond: requestRetestAPI,
    args: (specs, {reason, reviewImmediately = false}) =>
      specs.concat(reason as string, String(reviewImmediately === true))
  },
  requestFeature: {
    respond: requestFeatureAPI,
    args: (specs, {feature}) => [feature] as string[]
  },
  questionDiagnosis: {
    respond: questionDiagnosisAPI,
    args: (specs, {engineID, ruleID, reason}) =>
      specs.concat(engineID as string, ruleID as string, reason as string)
  },
  awaitTest: {respond: awaitTestAPI, args: specs => specs}
};

// FUNCTIONS

// Handles a request to the API interface, dispatching it to the service named by
// the first segment of the path tail after /api.
export const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  pathTail: string,
  postData: unknown
): Promise<void> => {
  const [service, ...specs] = pathTail.split('/') as [string, ...string[]];
  const services = request.method === 'POST' ? postServices : getServices;
  const entry = services[service];
  // If the service is valid:
  if (entry) {
    // Get the response body.
    const responseBody = await entry.respond(
      entry.args(specs, (postData ?? {}) as Record<string, unknown>)
    );
    await recordPageMetric(request, 'apiOperations', service);
    // Send it.
    setHeaders(response, 'application/json', null, entry.volatility ?? 'ultra');
    response.end(JSON.stringify(responseBody));
  }
  // Otherwise, i.e. if the service is invalid:
  else {
    // Report this.
    const message = request.method === 'POST'
      ? 'ERROR: Invalid service requested'
      : 'Invalid service request';
    await serveError({message}, response, false);
  }
};
