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
    // Return why.
    return {
      status: 'error',
      message: error
    };
  }
  // Otherwise, i.e. if it succeeded, process the recommendation.
  return await processRec('retest', __dirname, what, url, why);
};
