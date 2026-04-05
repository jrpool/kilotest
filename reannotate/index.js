/*
  index.js
  Implements a reannotation order.
*/

// IMPORTS

const {annotateReport, getTargetLogs, ruleIDs} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Implements a reannotation order and returns an acknowledgement page.
exports.answer = async authCode => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // Get the logs of the latest reports per target.
    const targetsData = await getTargetLogs();
    // For each report:
    for (const targetData of targetsData) {
      const [timeStamp, jobID] = targetData.jobName.split('-');
      // Reannotate it.
      await annotateReport(ruleIDs, timeStamp, jobID);
    }
    // Get the answer page.
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
    error: 'Invalid authorization code'
  };
};
