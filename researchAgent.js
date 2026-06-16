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
const host = hostParts[1];
const port = hostParts[2] || (scheme === 'https' ? 443 : 80);

// FUNCTIONS

// Submits two request to a random Kilotest host.
const requestService = async () => {
  const client = scheme === 'https' ? httpsClient : httpClient;
  const getRequestOptions = path => ({
    method: 'GET',
    host,
    port,
    path,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
  const path = `/api/targets`;
  console.log(`About to submit ${scheme} request as JSON on port ${port} to ${host}${path}`);
  // Submit a targets request.
  client.request(getRequestOptions(path), response => {
    // Initialize a collection of data from the response.
    const chunks = [];
    response
    // If the response throws an error:
    .on('error', async error => {
      // Report it.
      console.log(error.message);
    })
    // If the response delivers data:
    .on('data', chunk => {
      // Add them to the collection.
      chunks.push(chunk);
    })
    // When the response is completed:
    .on('end', async () => {
      const content = chunks.join('');
      try {
        // Output it.
        const contentObj = JSON.parse(content);
        console.log('======================');
        console.log(JSON.stringify(contentObj, null, 2));
        // Get the IDs of the available reports.
        const reportIDs = contentObj['available reports'].map(report => report.identifier);
        // Choose one at random.
        const [timeStamp, jobID] = reportIDs[Math.floor(Math.random() * reportIDs.length)]
        .split('-');
        console.log('======================');
        const path = `/api/reportIssues/${timeStamp}/${jobID}`;
        console.log(`About to submit ${scheme} request as JSON on port ${port} to ${host}${path}`);
        const requestOptions = getRequestOptions(path);
        // Submit an issues request for it.
        client.request(requestOptions, response => {
          // Initialize a collection of data from the response.
          const chunks = [];
          response
          // If the response throws an error:
          .on('error', async error => {
            // Report it.
            console.log(error.message);
          })
          // If the response delivers data:
          .on('data', chunk => {
            // Add them to the collection.
            chunks.push(chunk);
          })
          // When the response is completed:
          .on('end', async () => {
            const content = chunks.join('');
            try {
              // Output it.
              const contentObj = JSON.parse(content);
              console.log(JSON.stringify(contentObj, null, 2));
              console.log('======================');
            }
            catch (error) {
              console.log(error.message);
              console.log(`Issues response content: ${content || 'No content'}`);
            }
          });
        })
        // Finish sending the issues request.
        .end();
      }
      catch (error) {
        console.log(error.message);
        console.log(`Targets response content: ${content || 'No content'}`);
      }
    });
  })
  // Finish sending the targets request.
  .end();
};

// EXECUTION

// Execute the research agent.
requestService();
