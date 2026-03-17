/*
  index.js
  Tests a target.
*/

// IMPORTS

const {getLog, getNowStamp} = require('../util');
const {doJob} = require('testaro/run');
const fs = require('fs/promises');

// FUNCTIONS

// Deletes obsolete ibm results.
const killOldIBMResults = async () => {
  const resultFileNames = await fs.readdir('results');
  for (const fileName of resultFileNames) {
    const fileStats = await fs.stat(`results/${fileName}`);
    const fileAge = Date.now() - fileStats.mtimeMs;
    if (fileAge > 1200000) {
      await fs.unlink(`results/${fileName}`);
    }
  }
}
// Starts a retest and returns an acknowledgement page.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const {pageWhat, pageURL} = log;
  const query = {
    target: pageWhat
  };
  // Log the order.
  console.log(`Retest ordered and started for ${pageWhat}`);
  // Delete any obsolete IBM results.
  await killOldIBMResults();
  // Get the job template.
  const jobTemplateJSON = await fs.readFile(`${__dirname}/job.json`, 'utf8');
  const job = JSON.parse(jobTemplateJSON);
  // Populate the template with job properties.
  const newJobID = Date.now().toString(36).slice(5);
  job.id = newJobID;
  const nowStamp = getNowStamp();
  job.creationTimeStamp = nowStamp;
  job.executionTimeStamp = nowStamp;
  job.target.what = pageWhat;
  job.target.url = pageURL;
  console.log(`Order to retest ${pageWhat} (${pageURL}) assigned to job ${jobID}`);
  // Start the ordered retest.
  const report = await doJob(job, jobOpts);
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
