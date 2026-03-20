/*
  index.js
  Processes a test recommendation.
*/

// IMPORTS

const {getJSON, getNowStamp, getPlainText, getJob} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Records a test recommendation and returns an acknowledgement page.
exports.answer = async (pageArgs, why) => {
  const [what, url, why] = pageArgs.split('/');
  const queuePath = path.join(__dirname, '..', 'jobs', 'queue');
  const claimedPath = path.join(__dirname, '..', 'jobs', 'claimed');
  // Get the data on pages being tested.
  const claimNames = await fs.readdir(claimedPath);
  // For each claimed job:
  for (const claimName of claimNames) {
    const job = await getJob(path.join(claimedPath, claimName));
    // If its target is the recommended page:
    if (job.target.url === url) {
      // Return an answer reporting this.
      return {
        status: 'error',
        error: 'Page is already being tested'
      };
    }
  }
  // If the page is not claimed, get the data on queued pages.
  const queuedNames = await fs.readdir(queuePath);
  // For each queued job:
  for (const queuedName of queuedNames) {
    const job = await getJob(path.join(queuePath, queuedName));
    // If its target is the recommended page:
    if (job.target.url === url) {
      // Return an answer reporting this.
      return {
        status: 'error',
        error: 'Page is already queued for testing'
      };
    }
  }
  const recsJSON = await fs.readFile(recsPath, 'utf8');
  const recs = JSON.parse(recsJSON);
  recs[targetWhat] ??= [];
  const plainWhy = getPlainText(why);
  // Add the recommendation to those for the target.
  recs[targetWhat].push({
    timeStamp: getNowStamp(),
    why: plainWhy
  });
  // Save the revised recommendations.
  await fs.writeFile(recsPath, getJSON(recs));
  const query = {
    target: targetWhat,
    why: plainWhy
  };
  // Log the recommendation.
  console.log(`Retest recommendation received for ${targetWhat}: ${plainWhy}`);
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
