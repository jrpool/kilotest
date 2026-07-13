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

// Gets and outputs the content or error message from a response.
const getContent = async response => {
  const content = await new Promise(resolve => {
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
      const contentString = chunks.join('');
      try {
        const content = JSON.parse(contentString);
        // Return the response content as an object.
        resolve(content);
      }
      // If it is not JSON:
      catch {
        // Return this.
        resolve({message: `Response content not JSON (${contentString})`});
      }
    });
  });
  console.log(JSON.stringify(content, null, 2));
  return content;
};
const getRequestOptions = (path, method = 'GET') => ({
  method,
  host,
  port,
  path,
  headers: {
    'content-type': 'application/json; charset=utf-8'
  }
});
// Submits a request, returns the response content, and increments the results.
const submitRequest = async (path, method, body = null) => new Promise(resolve => {
  console.log(`Making ${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    const responseContent = await getContent(response);
    resolve(responseContent);
  })
  .on('error', error => {
    console.log(`ERROR submitting request (${JSON.stringify(error, null, 2)})`);
    resolve({error});
  })
  .end(body ? JSON.stringify(body) : '');
});
// Submits requests to a random Kilotest host.
const requestService = async () => {
  let method;
  let path;
  let content;
  let reports;
  let report;
  let timeStamp;
  let jobID;
  let description;
  let url;
  console.log('======================\nRequest: Summarize nonexistent reports');
  method = 'POST';
  path = '/api/target';
  content = await submitRequest(path, method, {
    description: 'oesntuhaesouht',
    hostname: 'osentuhaoesuht.aoesntuh'
  });
  if (content.error) {
    return;
  }
  console.log('======================\nRequest: List all available reports');
  method = 'GET';
  path = '/api/reportList';
  content = await submitRequest(path, method);
  reports = content?.['response content'] ?? [];
  if (content.error || ! Array.isArray(reports) || ! reports.length) {
    return;
  }
  console.log('======================\nRequest: Summarize matching reports');
  // Choose one available report at random.
  report = reports[Math.floor(Math.random() * reports.length)];
  ({description, URL: url} = report?.['tested web page'] ?? ['', '']);
  if (! (description && url)) {
    return;
  }
  method = 'POST';
  path = '/api/target';
  content = await submitRequest(path, method, {
    description,
    hostname: new URL(url).hostname ?? ''
  });
  if (content.error) {
    return;
  }
  console.log('======================\nRequest: Summarize one nonexistent report');
  [timeStamp, jobID] = ['111111T1111', 'abc'];
  method = 'GET';
  path = `/api/reportSummary/${timeStamp}/${jobID}`;
  content = await submitRequest(path, method);
  if (! content.message) {
    return;
  }
  console.log('======================\nRequest: Summarize one report');
  [timeStamp, jobID] = report.identifier?.split('-') ?? ['', ''];
  if (! (timeStamp && jobID)) {
    return;
  }
  method = 'GET';
  path = `/api/reportSummary/${timeStamp}/${jobID}`;
  content = await submitRequest(path, method);
  if (content.message || ! content.summary) {
    return;
  }
  console.log('======================\nRequest: Describe one issue from one report');
  if (content['response content']['number of elements reported as violators'] === 0) {
    console.log('reportIssue request cannot be submitted, because no issues were reported');
  }
  else {
    // Get the issue IDs.
    const issueIDs = Object
    .values(content['response content']['issues revealed'])
    .map(issue => issue.identifier);
    // Choose one at random.
    const issueID = issueIDs[Math.floor(Math.random() * issueIDs.length)];
    method = 'GET';
    path = `/api/reportIssue/${issueID}/${timeStamp}/${jobID}`;
    content = await submitRequest(path, method);
    if (content.message) {
      return;
    }
  }
  console.log('======================\nRequest: Make a permitted test recommendation');
  method = 'POST';
  path = '/api/testRecForm';
  content = await submitRequest(path, method, {
    'description of the web page': 'aoseeou',
    'URL of the web page': 'https://oaaestuh.osneth',
    'reason for testing the web page': 'Just testing'
  });
  if (content.message) {
    return;
  }
  console.log('======================\nRequest: Make an illicit test recommendation');
  content = await submitRequest(path, method, {
    'description of the web page': description,
    'URL of the web page': url,
    'reason for testing the web page': 'Just testing'
  });
  if (! content.message) {
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
