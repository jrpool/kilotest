/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getLatestReportExtracts, processRec} = require('../util');

// FUNCTIONS

// Records a retest recommendation and returns an acknowledgement page.
exports.answer = async (pageArgs, why) => {
  const [timeStamp, jobID] = pageArgs.split('/');
  // Get data on the latest available reports.
  const reportExtracts = await getLatestReportExtracts();
  // Get data on the report whose page is to be retested.
  const reportExtract = reportExtracts.find(
    reportExtract => reportExtract.timeStamp === timeStamp && reportExtract.jobID === jobID
  );
  const {error, url, what} = reportExtract;
  // If this failed:
  if (error) {
    // Return why.
    return {
      status: 'error',
      message: error
    };
  }
  // Otherwise, i.e. if it succeeded, process the recommendation.
  return await processRec('retest', __dirname, what, url, why);
};
