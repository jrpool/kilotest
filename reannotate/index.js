/*
  index.js
  Implements a reannotation order, i.e. an order to update the issue IDs of the standard instances of the latest reports on all tested targets.
*/

// IMPORTS

const {annotateReport, getReportsData, ruleIDs} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Implements a reannotation order and returns an acknowledgement page.
exports.answer = async authCode => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // Get data on the available reports.
    const reportsData = await getReportsData();
    // If this succeeded:
    if (reportsData) {
      // For each report:
      for (const reportData of reportsData) {
        // Reannotate it.
        const annotationError = await annotateReport(
          ruleIDs, reportData.timeStamp, reportData.jobID
        );
        // If this failed:
        if (annotationError) {
          // Return an error page.
          return {
            status: 'error',
            message: annotationError
          };
        }
      }
    }
    // Otherwis, i.e. if it failed:
    else {
      // Return an error page.
      return {
        status: 'error',
        message: 'Failed to get data on the available reports'
      };
    }
    // If every annotation succeeded, get the answer page.
    let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
    // Return it.
    return {
      status: 'ok',
      answerPage
    };
  }
  // Otherwise, i.e. if the authorization code is invalid, return an error page.
  return {
    status: 'error',
    message: 'Invalid authorization code'
  };
};
