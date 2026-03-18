/*
  index.js
  Implements a retest order.
*/

// IMPORTS

const {getJSON, getLog, getNowStamp} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Implements a retest order and returns an acknowledgement page.
exports.answer = async (pageArgs, authCode) => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    const [timeStamp, jobID] = pageArgs.split('/');
    const log = await getLog(timeStamp, jobID);
    const {pageWhat, pageURL} = log;
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
    const jobName = `${nowStamp}-${newJobID}`;
    const query = {
      target: pageWhat,
      jobName
    };
    // Save the job in the queue.
    await fs.writeFile(`${__dirname}/../jobs/queue/${jobName}.json`, getJSON(job));
    // Log the order.
    console.log(`Retest queued for ${pageWhat} as job ${jobName}`);
    // Get the recommendations.
    const recsJSON = await fs.readFile(`${__dirname}/../jobs/recs.json`, 'utf8');
    const recs = JSON.parse(recsJSON);
    // Delete the recommendations to retest the target.
    delete recs[pageWhat];
    // Save the revised recommendations.
    await fs.writeFile(`${__dirname}/../jobs/recs.json`, getJSON(recs));
    // Get the answer template.
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
  }
  // Otherwise, i.e. if the authorization code is invalid, return an error page.
  return {
    status: 'error',
    error: 'Invalid authorization code'
  };
};
