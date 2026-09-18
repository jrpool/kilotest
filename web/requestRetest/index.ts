/*
  index.ts
  Records a retest request.
*/

// IMPORTS

import {getReportExtract, populateTemplate, processTestRequest} from '../../util.ts';

// FUNCTIONS

export const answer = async (pageArgs: string, reason: string) => {
  const [timeStamp, jobID] = pageArgs.split('/') as [string, string];
  // Get an extract of the cited report.
  const extract = await getReportExtract(timeStamp, jobID);
  // If this failed:
  if ('error' in extract) {
    // Report this.
    return {
      status: 'error',
      message: 'Invalid request'
    };
  }
  const {description, url} = extract;
  // Otherwise, i.e. if it succeeded, process the request.
  const result = await processTestRequest('retest', description, url, reason, timeStamp, jobID);
  // If the request was recorded:
  if (result === 'ok') {
    const query = {
      description,
      url,
      reason
    };
    // Return the populated page.
    return {
      status: 'ok',
      answerPage: await populateTemplate(import.meta.dirname, query)
    };
  }
  // Otherwise, if the request is a duplicate:
  else if (result === 'duplicate') {
    // Report this.
    return {
      status: 'error',
      message: 'Test request duplicates an already submitted request'
    };
  }
  // Otherwise, if the cited report has been superseded:
  else if (result === 'superseded') {
    // Report this.
    return {
      status: 'error',
      message: 'A later report about the page is already available'
    }
  }
  // Otherwise, if the cited report does not exist:
  else if (result === 'nonreport') {
    // Report this.
    return {
      status: 'error',
      message: 'The report you want an update of does not exist'
    }
  }
  // Otherwise, i.e. if a request to test a page with the same description or URL is approved:
  else {
    // Report this.
    return {
      status: 'error',
      message: 'A request to test a page with the same description or URL is already approved'
    }
  }
};
