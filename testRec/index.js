/*
  index.js
  Processes a test recommendation.
*/

// IMPORTS

const {getJSON, getNowStamp, getPlainText, getPOSTData, isRecommendable} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Records a test recommendation and returns an acknowledgement page.
exports.answer = async (pageArgs, why) => {
  const [what, url] = pageArgs.split('/');
  const status = await isRecommendable(url);
  // If the target is not recommendable:
  if (status) {
    // Return an answer reporting this.
    return {
      status: 'error',
      error: `Page is already ${status}`
    };
  }
  // Otherwise, i.e. if it is recommendable, make the reason display-safe.
  const plainWhy = getPlainText(why);
  // Add the recommendation to those for the target.
  recs[what].push({
    timeStamp: getNowStamp(),
    what,
    why: plainWhy
  });
  // Save the revised recommendations.
  await fs.writeFile(recsPath, getJSON(recs));
  const query = {
    target: what,
    why: plainWhy
  };
  // Log the recommendation.
  console.log(`Retest recommendation received for ${what}: ${plainWhy}`);
  // Get the template.
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
