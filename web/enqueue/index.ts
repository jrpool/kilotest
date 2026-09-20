/*
  index.ts
  Implements a test request approval.
*/

// IMPORTS

import {
  deleteTestRequests, getJSON, getNowStamp, getRandomString, jobsPath, populateTemplate
} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Implements a test request approval and returns a revised request page. The caller
// (index.ts, this function's only caller) has already validated the URL and
// authorization code before invoking this function.
export const answer = async (url: string, description: string) => {
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
  job.target.what = description;
  job.target.url = url;
  const query: Record<string, string> = {
    target: description,
    jobName
  };
  // Save the job in the queue.
  await fs.writeFile(
    path.join(jobsPath(), 'queue', `${jobName}.json`), getJSON(job)
  );
  console.log(`Retest queued for ${description} as job ${jobName}`);
  // Delete the test requests for the target.
  await deleteTestRequests(url);
  // Get the populated answer template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
