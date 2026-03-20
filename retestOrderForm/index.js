/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getAgoString, getDateTimeString, getLog} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a retest order form.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const targetWhat = log.pageWhat;
  const recsPath = path.join(__dirname, '..', 'jobs', 'recs.json');
  const recsJSON = await fs.readFile(recsPath, 'utf8');
  const recs = JSON.parse(recsJSON);
  const targetRecs = recs[targetWhat] || [];
  const margin = ' '.repeat(8);
  const lines = [];
  targetRecs.forEach(rec => {
    lines.push(`${margin}<li>${getDateTimeString(rec.timeStamp)}: ${rec.why}</li>`);
  });
  const query = {
    target: targetWhat,
    ago: getAgoString(timeStamp),
    jobID,
    timeStamp,
    dateTime: getDateTimeString(timeStamp),
    recs: lines.join('\n')
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
