/*
  util.ts
  Utilities for web UI requests.
*/

// IMPORTS

import {sendAlert} from '../alerts.ts';
import {
  addTestRequest,
  getAgoDays,
  getReportExtracts,
  getNowStamp,
  getPlainText,
  getRandomString,
  getReportExtract,
  getReportStats,
  objectSort,
  ruleEngines
} from '../util.ts';
import type {ReportExtract} from '../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// TYPES


// FUNCTIONS

// Processes a test or retest request.
export const processTestRequest = async (testType: 'test' | 'retest', dirName: string, description: string, url: string, reason: string): Promise<{status: string, message?: string, answerPage?: string}> => {
  // If the request is valid:
  if (
    ['test', 'retest'].includes(testType)
    && ['Test', 'Retest'].some(end => dirName.endsWith(end))
    && description
    && isURL(url)
    && reason.length > 4
  ) {
    // Make the reason display-safe.
    const plainWhy = getPlainText(reason);
    // Update the waiting test requests as a transaction.
    const updateResult = await addTestRequest(description, url, plainWhy);
    // If the request was a duplicate:
    if (updateResult === 'duplicate') {
      // Return this.
      return {
        status: 'error',
        message: 'Duplicate request'
      };
    }
    // Otherwise, i.e. if it was not a duplicate:
    else {
      // Log the request.
      console.log(`Test request received for ${description}: ${plainWhy}`);
      // Alert a manager about it.
      await sendAlert(
        `Kilotest: new ${testType} request in the UI`,
        `Target: ${description}\nURL: ${url}\nReason: ${plainWhy}`
      );
      // Get the populated template.
      const answerPage = await populateTemplate(dirName, {
        target: description,
        why: plainWhy
      });
      // Return the populated page.
      return {
        status: 'ok',
        answerPage
      };
    }
  }
  return {
    status: 'error',
    message: 'Invalid request'
  };
};
