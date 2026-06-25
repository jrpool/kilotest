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
// Randomly chosen Kilotest host.
const kilotestHost = kilotestHosts[Math.random() < 0.5 ? 0 : 1];
const hostParts = kilotestHost.split(/:\/*/);
const scheme = hostParts[0];
const client = scheme === 'https' ? httpsClient : httpClient;
const host = hostParts[1];
const port = hostParts[2] || (scheme === 'https' ? 443 : 80);
const results = [];

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
      catch (error) {
        // Return this.
        resolve({error: `Response content not JSON (${contentString})`});
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
// Submits a request, awaits the response, and returns the response content.
const submitRequest = async (path, method = 'GET', body = null) => new Promise(resolve => {
  client.request(getRequestOptions(path, method), async response => {
    const responseContent = await getContent(response);
    results.push(responseContent.error ? 'bad' : 'good');
    resolve(responseContent);
  })
  .end(body ? JSON.stringify(body) : undefined);
});
// Submits requests to a random Kilotest host.
const requestService = async () => {
  let method;
  let path;
  let content;
  let reports;
  let report;
  let identifier;
  let timeStamp;
  let jobID;
  let description;
  let URL;
  console.log('======================\nRequest 1: Summarize nonexistent reports');
  method = 'POST';
  path = '/api/target';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  content = await submitRequest(path, method, {
    what: 'oesntuhaesouht',
    url: 'osentuhaoesuht'
  });
  if (content.error) {
    return;
  }
  console.log('======================\nRequest 2: Summarize all available reports');
  method = 'GET';
  path = '/api/targets';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  content = await submitRequest(path, method);
  reports = content?.['available reports'] ?? [];
  if (content.error || ! Array.isArray(reports) || ! reports.length) {
    return;
  }
  console.log('======================\nRequest 3: Summarize matching reports');
  // Choose one available report at random.
  report = reports[Math.floor(Math.random() * reports.length)];
  ({description, URL} = report?.['tested web page'] ?? ['', '']);
  if (! (description && URL)) {
    return;
  }
  method = 'POST';
  path = '/api/target';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  content = await submitRequest(path, method, {
    what: description,
    url: URL
  });
  if (content.error) {
    return;
  }
  console.log(
    '======================\nRequest 4: Summarize the issues in a report'
  );
  [timeStamp, jobID] = report.identifier?.split('-') ?? ['', ''];
  if (! (timeStamp && jobID)) {
    return;
  }
  method = 'GET';
  path = `/api/reportIssues/${timeStamp}/${jobID}`;
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  content = await submitRequest(path, method);
  if (content.error) {
    return;
  }
  console.log('======================\nRequest 5: Make a permitted test recommendation');
  method = 'POST';
  path = '/api/testRecForm';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  content = await submitRequest(path, method, {
    'description of the web page': 'aoseeou',
    'URL of the web page': 'oseantuhaosunth.aoenu',
    'reason for testing the web page': 'Just testing'
  });
  if (content.error) {
    return;
  }
  console.log('======================\nRequest 6: Make an illicit test recommendation');
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  content = await submitRequest(path, method, {
    'description of the web page': description,
    'URL of the web page': URL,
    'reason for testing the web page': 'Just testing'
  });
  if (content.error) {
    return;
  }
  console.log(`Results: ${results}`);
};

// EXECUTION

// Execute the research agent.
(async () => {
  await requestService();
})();
