/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getJSON, getLog, getNowStamp, getPlainText} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Records a retest recommendation and returns an acknowledgement page.
exports.answer = async (pageArgs, why) => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const targetWhat = log.pageWhat;
  const recsPath = `${__dirname}/../jobs/recs.json`;
  // Get the data on waiting recommendations.
  const recsJSON = await fs.readFile(recsPath, 'utf8');
  const recs = JSON.parse(recsJSON);
  wants[targetWhat] ??= [];
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
  let answerPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
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
