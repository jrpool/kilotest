/*
  index.js
  Processes a test recommendation.
*/

// IMPORTS

const {isRecommendable, processRec} = require('../util');

// FUNCTIONS

// Records a test recommendation and returns an acknowledgement page.
exports.answer = async (what, url, why) => {
  const status = await isRecommendable(url);
  // If the target is already claimed or queued and is thus not recommendable:
  if (status) {
    // Return an answer reporting this.
    return {
      status: 'error',
      error: `Page is already ${status}`
    };
  }
  // Otherwise, i.e. if it is recommendable, process the recommendation.
  return await processRec('test', __dirname, what, url, why);
};
