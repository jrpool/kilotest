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
  const log = await getLog(timeStamp, jobID);
  const {url, what} = log;
  // Process the recommendation.
  return await processRec('retest', __dirname, what, url, why);
};
