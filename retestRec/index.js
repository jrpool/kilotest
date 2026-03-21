/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getJSON, getLog, getNowStamp, getPlainText, getRecs, jobsPath} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Records a retest recommendation and returns an acknowledgement page.
exports.answer = async (pageArgs, why) => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const targetURL = log.pageURL;
  // Get the data on waiting recommendations.
  const recs = await getRecs();
  recs[targetURL] ??= [];
  const plainWhy = getPlainText(why);
  // Add the recommendation to those for the target.
  recs[targetURL].push({
    timeStamp: getNowStamp(),
    what: log.what,
    why: plainWhy
  });
  // Save the revised recommendations.
  await fs.writeFile(path.join(jobsPath, 'recs.json'), getJSON(recs));
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
