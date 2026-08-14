/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  researchAgent.js
  Simulates a research agent.
*/

// IMPORTS

require('dotenv').config();
const httpClient = require('http');
const httpsClient = require('https');

// CONSTANTS

const kilotestHosts = [
  process.env.LOCAL_KILOTEST_HOST || 'http://localhost:3000',
  process.env.DEPLOYED_KILOTEST_HOST || 'https://kilotest.com'
];
// Kilotest host specified by the argument.
const kilotestHost = kilotestHosts[process.argv[2] === 'pub' ? 1 : 0];
const hostParts = kilotestHost.split(/:\/*/);
const scheme = hostParts[0] === 'https' ? 'https' : 'http';
const client = scheme === 'https' ? httpsClient : httpClient;
const host = hostParts[1] || 'localhost';
const port = hostParts[2] || (scheme === 'https' ? 443 : 80);

// FUNCTIONS

// Gets, parses into an object, and returns the body of a response.
const getBody = async response => {
  const body = await new Promise(resolve => {
    // Initialize an array of data from the response.
    const chunks = [];
    response
    // If the response throws an error:
    .on('error', error => {
      const {message} = error;
      // Report and return the error message.
      console.log(message);
      resolve({error: message});
    })
    // Whenever the response delivers data:
    .on('data', chunk => {
      // Add them to the array.
      chunks.push(chunk);
    })
    // When the response is completed:
    .on('end', () => {
      const bodyString = chunks.join('');
      try {
        const body = JSON.parse(bodyString);
        // Return the response body as an object.
        resolve(body);
      }
      // If it is not JSON:
      catch {
        // Return this.
        resolve({error: `Response body not JSON (${bodyString})`});
      }
    });
  });
  return body;
};
const getRequestOptions = (path, method = 'GET') => ({
  method,
  host,
  port,
  path,
  headers: {
    'body-type': 'application/json; charset=utf-8'
  }
});
// Submits a request, returns the response body, and increments the results.
const submitRequest = async (path, method, requestBody = null) => new Promise(resolve => {
  console.log(`Making ${scheme} ${method} request on port ${port} of ${host} to ${path}`);
  client.request(getRequestOptions(path, method), async response => {
    const responseBody = await getBody(response);
    resolve(responseBody);
  })
  .on('error', error => {
    console.log(`ERROR submitting request (${JSON.stringify(error, null, 2)})`);
    resolve({error});
  })
  .end(requestBody ? JSON.stringify(requestBody) : '');
});
// Submits requests to the specified Kilotest host.
const requestService = async () => {
  let body;
  let jobID;
  let method;
  let path;
  let reportBasics;
  let reportsBasics;
  let requestDetails;
  let requestDisposition;
  let responseContent;
  let timeStamp;
  console.log('======================\nRequest: List all available reports');
  method = 'GET';
  path = '/api/listReports';
  body = await submitRequest(path, method);
  responseContent = body?.['response content'] ?? {};
  reportsBasics = responseContent?.['basics about all available reports'] ?? [];
  if (
    !reportsBasics.length
    || !Array.isArray(reportsBasics)
    || !reportsBasics.length
    || reportsBasics.some(
      reportBasics => reportBasics['how to get details about the report']?.method !== 'GET'
    )
  ) {
    console.log(`reportsBasics: ${JSON.stringify(reportsBasics, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: List issues in one nonexistent report');
  [timeStamp, jobID] = ['111111T1111', 'abc'];
  method = 'GET';
  path = `/api/listIssues/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method);
  responseContent = body?.['response content'] ?? {};
  reportBasics = responseContent?.['basics about the report'] ?? {};
  if (
    !reportBasics.error || !reportBasics.error.includes('missing, unreadable, or not JSON')
  ) {
    console.log(`reportBasics: ${JSON.stringify(reportBasics, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: List issues in one report');
  const reportsBasicsIndex = Math.floor(reportsBasics.length * Math.random());
  // Choose one report at random.
  reportBasics = reportsBasics[reportsBasicsIndex];
  [timeStamp, jobID] = reportBasics.identifier?.split('-') || [null, null];
  if (!(timeStamp && jobID)) {
    console.log(`reportBasicsIndex: ${reportsBasicsIndex}`);
    console.log(`reportBasics: ${JSON.stringify(reportBasics, null, 2)}`);
    return;
  }
  path = `/api/listIssues/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method);
  responseContent = body?.['response content'] ?? {};
  const issuesBasics = responseContent?.['basics about all issues reported in the report'] ?? [];
  if (
    !issuesBasics.length
    || !Array.isArray(issuesBasics)
    || !issuesBasics.length
    || issuesBasics.some(issueBasics => !issueBasics['impact on a user'])
  ) {
    console.log(`issuesBasics: ${JSON.stringify(issuesBasics, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: List violators of one issue in one report');
  // Get the issue IDs.
  const issueIDs = issuesBasics.map(issueBasics => issueBasics.identifier);
  // Choose one at random.
  const issueID = issueIDs[Math.floor(Math.random() * issueIDs.length)];
  path = `/api/listViolators/${issueID}/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method);
  responseContent = body?.['response content'] ?? {};
  const violatorsBasics = responseContent?.['basics about all elements exhibiting the issue'] ?? [];
  if (
    !violatorsBasics.length
    || !Array.isArray(violatorsBasics)
    || !violatorsBasics.length
    || violatorsBasics.some(violatorBasics => !violatorBasics[
      'count of rule engines reporting that the element exhibited the issue'
    ])
  ) {
    console.log(`violatorsBasics: ${JSON.stringify(violatorsBasics, null, 2)}`);
    return;
  }
  console.log(
    '======================\nRequest: List diagnoses of one violation of one issue in one report'
  );
  // Get the issue IDs.
  const violatorIDs = violatorsBasics.map(violatorBasics => violatorBasics.identifier);
  // Choose one at random.
  const violatorID = violatorIDs[Math.floor(Math.random() * violatorIDs.length)];
  path = `/api/listDiagnoses/${violatorID}/${issueID}/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method);
  responseContent = body?.['response content'] ?? {};
  const diagnoses = responseContent?.['diagnoses of how the element exhibited the issue'] ?? [];
  if (
    !diagnoses.length
    || !Array.isArray(diagnoses)
    || !diagnoses.length
    || diagnoses.some(
      diagnosis => typeof diagnosis !== 'object' || !diagnosis['description of the violation']
    )
  ) {
    console.log(`diagnoses: ${JSON.stringify(diagnoses, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: Get one report');
  path = `/api/getReport/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method);
  responseContent = body?.['response content'] ?? {};
  const fullReport = responseContent?.['full report'] ?? {};
  if (responseContent.error || typeof fullReport !== 'object' || !fullReport.device) {
    console.log('Full report request failed');
    return;
  }
  console.log('======================\nRequest: Make a test request with the GET method');
  path = '/api/requestTest';
  body = await submitRequest(path, method);
  if (body.error?.message !== 'Invalid service request') {
    console.log(`body: ${JSON.stringify(body, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: Request a test with a too short URL');
  method = 'POST';
  body = await submitRequest(path, method, {
    description: 'Zilch',
    URL: 'https://a.b',
    reason: 'Just because'
  });
  responseContent = body?.['response content'] ?? {};
  requestDetails = responseContent['details about your request'] ?? {};
  if (!requestDetails.error?.includes('specified a URL for the page')) {
    console.log(`requestDetails: ${JSON.stringify(requestDetails, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: Request a test');
  body = await submitRequest(path, method, {
    description: 'Organization that does not exist',
    URL: 'https://nonexistentorg.com',
    reason: 'I have no good reason for wanting this page to be tested'
  });
  responseContent = body?.['response content'] ?? {};
  requestDetails = responseContent['details about your request'] ?? {};
  requestDisposition = responseContent['disposition of your request'] ?? {};
  if (
    !requestDetails['reason why the page should be tested']
    || !requestDisposition['what happens next']?.includes('1 hour to 1 day')
  ) {
    console.log(`requestDetails: ${JSON.stringify(requestDetails, null, 2)}`);
    console.log(`requestDisposition: ${JSON.stringify(requestDisposition, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: Request a retest of a nonexistent report');
  path = `/api/requestRetest/${timeStamp}/xyz`;
  body = await submitRequest(path, method, {
    reason: 'It would be cool to retest what does not exist'
  });
  responseContent = body?.['response content'] ?? {};
  requestDetails = responseContent['details about your request'] ?? {};
  if (!requestDetails.error?.includes('not an available report')) {
    console.log(`requestDetails: ${JSON.stringify(requestDetails, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: Request a retest');
  path = `/api/requestRetest/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method, {
    reason: 'I just feel like making this request'
  });
  responseContent = body?.['response content'] ?? {};
  requestDetails = responseContent['details about your request'] ?? {};
  requestDisposition = responseContent['disposition of your request'] ?? {};
  if (
    !requestDetails['reason why the page should be retested']
    || !requestDisposition['how you can check for completion']
  ) {
    console.log(`requestDetails: ${JSON.stringify(requestDetails, null, 2)}`);
    console.log(`requestDisposition: ${JSON.stringify(requestDisposition, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: Make a feature request');
  path = `/api/requestFeature/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method, {
    feature: 'Do the impossible'
  });
  responseContent = body?.['response content'] ?? {};
  requestDetails = responseContent['details about your request'] ?? {};
  if (!requestDetails.disposition?.includes('received and logged')) {
    console.log(`requestDetails: ${JSON.stringify(requestDetails, null, 2)}`);
    return;
  }
  console.log('======================\nRequest: Results');
  console.log('All tests succeeded');
};

// EXECUTION

// Execute the research agent.
(async () => {
  await requestService();
})();
