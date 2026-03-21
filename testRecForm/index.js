/*
  index.js
  Answers the test question.
*/

// IMPORTS

const {getAgoString, getDateTimeString, getLog} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a retest recommendation form.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const query = {
    target: log.what,
    timeStamp,
    jobID,
    ago: getAgoString(timeStamp),
    dateTime: getDateTimeString(timeStamp)
  };
  // Get the recommendation form template.
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
