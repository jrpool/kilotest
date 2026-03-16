/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {
  getDateTimeString,
  getDateString,
  htmlSafe
} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (targetWhat, timeStamp, jobID, query) => {
  const retestScheduleJSON = await fs.readFile(`${__dirname}/retests.json`, 'utf8');
  const retestSchedule = JSON.parse(retestScheduleJSON);
  // Add the required properties to the query.
  query.target = targetWhat;
  const lastDate = new Date(getDateString(timeStamp));
  const currentDate = new Date();
  const agoDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
  query.ago = agoDays === 1 ? '1 day' : `${agoDays} days`;
  query.dateTime = getDateTimeString(timeStamp);
  query.job = jobID;
  const nextTimeStamp = retestSchedule[targetWhat];
  if (nextTimeStamp) {
    query.retest = `scheduled for ${getDateTimeString(nextTimeStamp)}`;
  }
  else {
    query.retest = 'not scheduled';
  }
  query.safeTarget = htmlSafe(targetWhat);
};
// Returns a page answering the issues question.
exports.answer = async pageArgs => {
  const [targetWhat, timeStamp, jobID] = pageArgs.split('/');
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(targetWhat, timeStamp, jobID, query);
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
