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

// Gets and outputs the body of a response.
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
  console.log(`Making ${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    const responseContent = await getBody(response);
    resolve(responseContent);
  })
  .on('error', error => {
    console.log(`ERROR submitting request (${JSON.stringify(error, null, 2)})`);
    resolve({error});
  })
  .end(requestBody ? JSON.stringify(requestBody) : '');
});
// Submits requests to the specified Kilotest host.
const requestService = async () => {
  let method;
  let path;
  let body;
  let reportListItems;
  let timeStamp;
  let jobID;
  let description;
  let url;
  console.log('======================\nRequest: List all available reports');
  method = 'GET';
  path = '/api/listReports';
  body = await submitRequest(path, method);
  reportListItems = body?.['response body'] ?? [];
  if (
    body.error
    || !Array.isArray(reportListItems)
    || !reportListItems.length
    || reportListItems.some(item => !item.includes('page with no report be tested'))
  ) {
    return;
  }
  console.log('======================\nRequest: List issues in one nonexistent report');
  [timeStamp, jobID] = ['111111T1111', 'abc'];
  method = 'GET';
  path = `/api/listIssues/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method);
  if (!body.error || !body.error.includes('missing, unreadable, or not JSON')) {
    return;
  }
  console.log('======================\nRequest: List issues in one report');
  const item = reportListItems[0];
  [timeStamp, jobID] = [item.timeStamp, item.jobID];
  if (!(timeStamp && jobID)) {
    return;
  }
  method = 'GET';
  path = `/api/listIssues/${timeStamp}/${jobID}`;
  body = await submitRequest(path, method);
  const {error, summary} = body;
  if (error || !(summary && body['response body']['tested web page'].URL)) {
    return;
  }
  console.log('======================\nRequest: Describe one issue from one report');
  if (body['response body']['number of elements reported as violators'] === 0) {
    console.log('reportIssue request cannot be submitted, because no issues were reported');
  }
  else {
    // Get the issue IDs.
    const issueIDs = Object
    .values(body['response body']['issues revealed'])
    .map(issue => issue.identifier);
    // Choose one at random.
    const issueID = issueIDs[Math.floor(Math.random() * issueIDs.length)];
    method = 'GET';
    path = `/api/reportIssue/${issueID}/${timeStamp}/${jobID}`;
    body = await submitRequest(path, method);
    if (body.message) {
      return;
    }
  }
  console.log('======================\nRequest: Make a permitted test recommendation');
  method = 'POST';
  path = '/api/testRecForm';
  body = await submitRequest(path, method, {
    'description of the web page': 'aoseeou',
    'URL of the web page': 'https://oaaestuh.osneth',
    'reason for testing the web page': 'Just testing'
  });
  if (body.message) {
    return;
  }
  console.log('======================\nRequest: Make an illicit test recommendation');
  body = await submitRequest(path, method, {
    'description of the web page': description,
    'URL of the web page': url,
    'reason for testing the web page': 'Just testing'
  });
  if (!body.message) {
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
