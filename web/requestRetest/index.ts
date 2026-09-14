/*
  index.ts
  Records a retest request.
*/

// IMPORTS

import {getReportExtracts, processTestRequest} from '../../util.ts';

// FUNCTIONS

export const answer = async (pageArgs: string, why: string) => {
  const [timeStamp, jobID] = pageArgs.split('/');
  // Get data on the latest available reports.
  const reportExtracts = await getReportExtracts(true);
  // Get data on the report whose page is to be retested.
  const reportExtract = reportExtracts.find(
    (extract) => extract.timeStamp === timeStamp && extract.jobID === jobID
  );
  // If no matching report was found:
  if (!reportExtract) {
    // Return why.
    return {
      status: 'error',
      message: `No report found for ${timeStamp}-${jobID}`
    };
  }
  const {url, description} = reportExtract;
  // Otherwise, i.e. if it succeeded, process the request.
  return await processTestRequest('retest', import.meta.dirname, description, url, why);
};
