/*
  index.js
  Answers the retests question.
*/

// IMPORTS

const {
  getDateTimeString,
  getDateString,
  getLog
} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Returns whether a job to retest a target is in the queue.
const isQueued = async targetWhat => {
  const queuedJobFileNames = await fs.readdir(`${__dirname}/../jobs/queue`);
  for (const fileName of queuedJobFileNames) {
    const jobJSON = await fs.readFile(`${__dirname}/../jobs/queue/${fileName}`);
    const job = JSON.parse(jobJSON);
    if (job.target.what === targetWhat) {
      return true;
    }
  }
  return false;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (targetWhat, timeStamp, jobID, query) => {
  const retestScheduleJSON = await fs.readFile(`${__dirname}/retests.json`, 'utf8');
  const retestSchedule = JSON.parse(retestScheduleJSON);
  // Add the target name to the query.
  query.target = targetWhat;
  // Add facts about the latest test of the target to the queue.
  const lastDate = new Date(getDateString(timeStamp));
  const currentDate = new Date();
  const agoDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
  query.ago = agoDays === 1 ? '1 day' : `${agoDays} days`;
  query.dateTime = getDateTimeString(timeStamp);
  query.job = jobID;
  // Add facts about the queued state of the target to the queue.
  const queued = await isQueued(targetWhat);
  query.queued = queued ? 'already' : 'not yet';
  query.
};
// Returns a page answering the retests question.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const targetWhat = log.pageWhat;
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
