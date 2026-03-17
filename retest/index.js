/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getJSON, getLog, getPlainText, getTimeStamp} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Records a retest recommendation and returns an acknowledgement page.
exports.answer = async (pageArgs, why) => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const targetWhat = log.pageWhat;
  // Get the data on waiting recommendations.
  const wantsJSON = await fs.readFile(`${__dirname}/wants.json`, 'utf8');
  const wants = JSON.parse(wantsJSON);
  wants[targetWhat] ??= [];
  why = getPlainText(why);
  // Add the recommendation to those for the target.
  wants[targetWhat].push({
    timeStamp: getTimeStamp(new Date()),
    why
  });
  // Save the revised data.
  await fs.writeFile(`${__dirname}/wants.json`, getJSON(wants));
  const query = {
    target: targetWhat
  };
  // Log the recommendation.
  console.log(`Retest recommendation received for ${targetWhat}: ${why}`);
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
