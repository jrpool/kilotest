/*
  index.js
  Implements a retest order.
*/

// IMPORTS

const {getJSON, getNowStamp, getRecs, isURL} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Implements a test order and returns an acknowledgement page.
exports.answer = async (url, what, authCode) => {
  // If the arguments are valid:
  if (isURL(url) && what && authCode === process.env.AUTH_CODE) {
    // Get the job template.
    const jobTemplateJSON = await fs.readFile(path.join(__dirname, '..', 'jobs/job.json'), 'utf8');
    const job = JSON.parse(jobTemplateJSON);
    // Populate the template with job properties.
    const newJobID = Date.now().toString(36).slice(5);
    job.id = newJobID;
    const nowStamp = getNowStamp();
    job.creationTimeStamp = nowStamp;
    job.executionTimeStamp = nowStamp;
    job.target.what = what;
    job.target.url = url;
    const jobName = `${nowStamp}-${newJobID}`;
    const query = {
      target: what,
      jobName
    };
    // Save the job in the queue.
    await fs.writeFile(
      path.join(__dirname, '..', 'jobs', 'queue', `${jobName}.json`), getJSON(job)
    );
    console.log(`Retest queued for ${what} as job ${jobName}`);
    // Get the recommendations.
    const recs = await getRecs();
    // Delete the recommendations to retest the target.
    delete recs[url];
    // Save the revised recommendations.
    await fs.writeFile(path.join(__dirname, '..', 'jobs', 'recs.json'), getJSON(recs));
    // Get the answer template.
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
  }
  // Otherwise, i.e. if the authorization code is invalid, return an error page.
  return {
    status: 'error',
    error: 'Invalid authorization code'
  };
};
