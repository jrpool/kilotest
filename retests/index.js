/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {
  getDateString,
  getTargetLogs,
  getTimeString,
  htmlSafe
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (targetWhat, query) => {
  const log = getTargetLogs(targetWhat);
  const {timeStamp} = log;
  const retestScheduleJSON = await fs.readFile(`${__dirname}/retests.json`, 'utf8');
  const retestSchedule = JSON.parse(retestScheduleJSON);
  // Add the required properties to the query.
  query.target = targetWhat;
  const lastDate = new Date(timeStamp);
  const currentDate = new Date();
  const agoDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
  query.ago = agoDays === 1 ? '1 day' : `${agoDays} days`;
  const nextTimeStamp = retestSchedule[targetWhat];
  if (nextTimeStamp) {
    const nextDateString = `${getDateString(nextTimeStamp)} at ${getTimeString(nextTimeStamp)}`;
    query.retest = `scheduled for ${nextDateString}`;
  }
  else {
    query.retest = 'not scheduled';
  }
  query.safeTarget = htmlSafe(targetWhat);
};
// Returns a page answering the issues question.
exports.answer = async () => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
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
