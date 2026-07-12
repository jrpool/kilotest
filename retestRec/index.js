/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getLog, processRec} = require('../util');

// FUNCTIONS

// Records a retest recommendation and returns an acknowledgement page.
exports.answer = async (pageArgs, why) => {
  const [timeStamp, jobID] = pageArgs.split('/');
  // Get the log of the specified report.
  const log = await getLog(timeStamp, jobID);
  const {error, url, what} = log;
  // If this failed:
  if (error) {
    // Report why.
    console.error(error);
  }
  // Process the recommendation, pretending it succeeded even if not.
  return await processRec('retest', __dirname, what, url, why);
};
