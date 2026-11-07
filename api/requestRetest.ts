/*
  requestRetest.ts
  Processes a request to retest a page and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {buildRequestDisposition, getRequestFailureReason, getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {checkLength, isReportID, orderJob, processTestRequest} from '../util.ts';
import {requestRetestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestRetestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [reportID = '', reason = '', review = ''] = args;
  const immediateAutomatedReview = review === 'true';
  const thisHost = getThisHost();
  const reasonCheck = checkLength(reason, 20, 100, 'reason');
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  // If the report identifier is not syntactically valid:
  if (!isReportID(reportID)) {
    requestDetails = {
      error: 'request invalid: the reportID is malformed'
    };
  }
  // Otherwise, if the encoded reason is too short or too long:
  else if (reasonCheck.status === 'error') {
    requestDetails = {
      error: `request invalid: your ${reasonCheck.message}`
    }
  }
  // Otherwise, i.e. if the request is facially valid:
  else {
    // If automated review was requested, order the retest: enqueue the job directly, with no
    // manual-approval step, gated only by the lightweight checks orderJob itself performs
    // (the target is not already claimed or queued, and the job queue is not already full).
    // Otherwise process the request for manager approval. Either path resolves the cited
    // report's description and URL itself.
    const processResult = immediateAutomatedReview
      ? await orderJob({reportID}, reason)
      : await processTestRequest(reason, {reportID});
    // If the cited report does not exist:
    if (processResult.result === 'nonreport') {
      requestDetails = {
        error: 'request invalid: the specified report does not exist'
      };
    }
    // Otherwise, i.e. if the cited report was found:
    else {
      const {result: requestResult, description, url} = processResult;
      // Add details about the request.
      requestDetails = {
        'date and time received': new Date().toISOString(),
        'page to be retested': {
          'description': description,
          'URL': url
        },
        'reason why the page should be retested': reason
      };
      // If automated review ran:
      if (immediateAutomatedReview) {
        // Add information about the disposition of the request.
        if (requestResult === 'ok' && 'reportID' in processResult && typeof processResult.reportID === 'string') {
          const orderedReportID = processResult.reportID;
          requestDisposition = {
            'what happens next': 'Testing has begun. Once it finishes, the report will be available via the listIssues tool.',
            'report identifier': orderedReportID,
            'how you can check for completion': `Call the listIssues tool with reportID "${orderedReportID}" to learn whether the report is ready.`,
            'do you want to wait for completion': 'Testing typically takes 2 to 4 minutes. Do you want to wait (and be notified of completion) instead of checking back later? If so, call the awaitTest tool with the same reportID.'
          };
        }
        else {
          requestDisposition = {
            'what happens next': `Your request will not be processed, because ${getRequestFailureReason(
              requestResult as Exclude<typeof requestResult, 'ok'>,
              {result: 'superseded', reason: 'a later report about a page with the same description is available.'}
            )}`,
            'report identifier': null,
            'how you can check for completion': 'Not applicable.',
            'do you want to wait for completion': 'Not applicable.'
          };
        }
      }
      // Otherwise, i.e. if manager review ran:
      else {
        // Add information about the disposition of the request.
        requestDisposition = buildRequestDisposition(
          requestResult,
          {
            whatHappensNext: 'Your request is likely to be approved and processed within 1 hour to 1 day.',
            howToCheck: 'You can call the listPages tool, or the listIssues tool on the current report, to learn whether the page has been retested and a new report is available.',
            howWebUserChecks: `A web user can visit ${thisHost}/listPages.html to learn whether the page has been retested and a new report is available.`
          },
          {result: 'superseded', reason: 'a later report about a page with the same description is available.'}
        );
      }
    }
  }
  // Create the response content.
  const responseContent: ResponseContent = {
    'details about your request': requestDetails,
    'disposition of your request': requestDisposition
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestRetest',
    'this request': {
      description: 'Process my request to retest a page. The reportID parameter identifies the latest available report about the page. It was in the response to my earlier listIssues request. The reason property of the request body is the reason why the page should be retested.',
      method: 'POST',
      URL: `${thisHost}/api/requestRetest/${reportID}`,
      body: {
        reason,
        immediateAutomatedReview
      },
      'closest ancestor request': {
        'tool name': 'listIssues',
        description: 'Provide details about one report, including basics about the issues reported in it.',
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${reportID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/requestRetestForm.html/${reportID}`,
      'closest ancestor request': `${thisHost}/listIssues.html/${reportID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
