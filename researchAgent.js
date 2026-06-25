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

const kilotestHosts = [process.env.LOCAL_KILOTEST_HOST, process.env.DEPLOYED_KILOTEST_HOST];
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
  const content = await new Promise((resolve, reject) => {
    // Initialize an array of data from the response.
    const chunks = [];
    response
    // If the response throws an error:
    .on('error', error => {
      const {message} = error;
      // Report and return the error message.
      console.log(message);
      reject({error: message});
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
        reject({error: `Response content not JSON (${contentString})`});
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
  console.log('======================\nRequest 1: Summarize nonexistent reports');
  method = 'POST';
  path = '/api/target';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    content = await getContent(response);
  })
  .end({
    what: 'oesntuhaesouht',
    url: 'osentuhaoesuht'
  });
  results.push(content.error ? 'bad' : 'good');
  if (content.error) {
    return;
  }
  console.log('======================\nRequest 2: Summarize all available reports');
  method = 'GET';
  path = '/api/targets';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    // Get an array of summaries of all available reports.
    content = await getContent(response);
  })
  .end();
  results.push(content.error ? 'bad' : 'good');
  if (content.error) {
    return;
  }
  console.log('======================\nRequest 3: Summarize matching reports');
  reports = content['available reports'];
  // Choose one available report at random.
  report = content[Math.floor(Math.random() * content.length)];
  [description, URL] = report['tested web page'];
  method = 'POST';
  path = '/api/target';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    content = await getContent(response);
  })
  .end({
    what: description,
    url: URL
  });
  results.push(content.error ? 'bad' : 'good');
  if (content.error) {
    return;
  }
  console.log(
    '======================\nRequest 4: Summarize the issues in a report'
  );
  ({identifier, 'tested web page': {description, URL}} = report);
  [timeStamp, jobID] = identifier.split('-');
  method = 'GET';
  path = `/api/reportIssues/${timeStamp}/${jobID}`;
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    content = await getContent(response);
  })
  .end();
  results.push(content.error ? 'bad' : 'good');
  if (content.error) {
    return;
  }
  console.log('======================\nRequest 5: Make a permitted test recommendation');
  method = 'POST';
  path = '/api/testRecForm';
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    content = await getContent(response);
  })
  .end({
    what: description,
    url: URL
  })
  .end({
    'description of the web page': 'aoseeou',
    'URL of the web page': 'oseantuhaosunth.aoenu',
    'reason for testing the web page': 'Just testing'
  });
  results.push(content.error ? 'bad' : 'good');
  if (content.error) {
    return;
  }
  console.log('======================\nRequest 6: Make an illicit test recommendation');
  console.log(`${scheme} ${method} request on port ${port} to ${host}${path}`);
  client.request(getRequestOptions(path, method), async response => {
    content = await getContent(response);
  })
  .end({
    what: description,
    url: URL
  })
  .end({
    'description of the web page': description,
    'URL of the web page': URL,
    'reason for testing the web page': 'Just testing'
  });
  results.push(content.error ? 'bad' : 'good');
  if (content.error) {
    return;
  }
};

// EXECUTION

// Execute the research agent.
requestService();
console.log(`Results: ${results}`);
