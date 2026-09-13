/*
  index.ts
  Implements a test request approval.
*/

// IMPORTS

import {
  deleteRec, getJSON, getNowStamp, getRandomString, isURL, jobsPath, populateTemplate
} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Implements a test request approval and returns a revised request page.
export const answer = async (url: string, what: string, authCode: string) => {
  // If the arguments are valid:
  if (isURL(url) && what && authCode === process.env.AUTH_CODE) {
    // Get the job template.
    const jobTemplateJSON = await fs.readFile(path.join(import.meta.dirname, '..', '..', 'job.json'), 'utf8');
    const job = JSON.parse(jobTemplateJSON);
    const nowStamp = getNowStamp();
    // Populate the template with job properties.
    const jobIDSuffix = getRandomString(3);
    const jobName = `${nowStamp}-${jobIDSuffix}`;
    job.id = jobName;
    job.creationTimeStamp = nowStamp;
    job.executionTimeStamp = nowStamp;
    job.target.what = what;
    job.target.url = url;
    const query: Record<string, string> = {
      target: what,
      jobName
    };
    // Save the job in the queue.
    await fs.writeFile(
      path.join(jobsPath(), 'queue', `${jobName}.json`), getJSON(job)
    );
    console.log(`Retest queued for ${what} as job ${jobName}`);
    // Delete the recommendations to test the target.
    await deleteRec(url);
    // Get the populated answer template.
    const answerPage = await populateTemplate(import.meta.dirname, query);
    // Return the populated page.
    return {
      status: 'ok',
      answerPage
    };
  }
  // Otherwise, i.e. if the authorization code is invalid, return an error page.
  return {
    status: 'error',
    message: 'Invalid authorization code'
  };
};
