/*
  index.js
  Records a retest request.
*/

// IMPORTS

const {getLatestReportExtracts, processTestRequest} = require('../../util');

// FUNCTIONS

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
  // Otherwise, i.e. if it succeeded, process the request.
  return await processTestRequest('retest', __dirname, what, url, why);
};
