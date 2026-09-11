/*
  index.cts
  Records a retest request.
*/

// IMPORTS

const {getReportExtracts, processTestRequest} = require('../../util.ts');

// FUNCTIONS

exports.answer = async (pageArgs: string, why: string) => {
  const [timeStamp, jobID] = pageArgs.split('/');
  // Get data on the latest available reports.
  const reportExtracts = await getReportExtracts(true);
  // Get data on the report whose page is to be retested.
  const reportExtract = reportExtracts.find(
    (reportExtract: any) => reportExtract.timeStamp === timeStamp && reportExtract.jobID === jobID
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
