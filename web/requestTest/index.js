/*
  index.js
  Records a test request.
*/

// IMPORTS

const {isRecommendable, processTestRequest} = require('../../util');

// FUNCTIONS

exports.answer = async (what, url, why) => {
  const status = await isRecommendable(url);
  // If the target is already claimed or queued and is thus not requestable:
  if (status) {
    // Return an answer reporting this.
    return {
      status: 'error',
      message: `Page is already ${status}`
    };
  }
  // Otherwise, i.e. if it is requestable, process the request.
  return await processTestRequest('test', __dirname, what, url, why);
};
