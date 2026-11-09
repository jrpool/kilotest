/*
  index.ts
  Implements a test request approval.
*/

// IMPORTS

import {htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry} from '../../registry.ts';
import {approveTestRequest, describePageError} from '../../requests.ts';

// FUNCTIONS

// Implements a test request approval and returns a confirmation page. The caller (index.ts, this function’s only caller) has already validated the URL and authorization code before invoking this function.
export const answer = async (url: string, requestID: string) => {
  const result = await approveTestRequest(url, requestID);
  // If the request does not exist:
  if (result.result === 'noRequest') {
    return {
      status: 'error',
      message: 'Invalid request'
    };
  }
  // If the request cannot be approved:
  if (result.result !== 'ordered') {
    return {
      status: 'error',
      message: `The request cannot be approved, because ${describePageError(result, await getRegistry())}`
    };
  }
  const query: Record<string, string> = {
    target: htmlSafe(`${result.page.siteName} ${result.page.pageName}`),
    jobName: result.reportID
  };
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, query)
  };
};
