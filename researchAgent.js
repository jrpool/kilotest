/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  researchAgent.js
  Module for simulating a research agent.
*/

// IMPORTS

const {getLogs} = require('./util');
require('dotenv').config();
const httpClient = require('http');
const httpsClient = require('https');

// CONSTANTS

const agent = process.env.RESEARCH_AGENT;
const agentPW = process.env.RESEARCH_AGENT_PW;
const kilotestHosts = [process.env.LOCAL_KILOTEST_HOST, process.env.DEPLOYED_KILOTEST_HOST];
// Randomly chosen Kilotest host.
const kilotestHost = kilotestHosts[Math.random() < 0.5 ? 0 : 1];
const hostParts = kilotestHost.split(/:\/*/);
const scheme = hostParts[0];
const host = hostParts[1];
const port = hostParts[2] || (scheme === 'https' ? 443 : 80);

// FUNCTIONS

// Submits a targets request to a random Kilotest host.
const requestService = async () => {
  const client = scheme === 'https' ? httpsClient : httpClient;
  const getRequestOptions = path => ({
    method: 'POST',
    host,
    port,
    path,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
  console.log(`About to submit ${scheme} request as JSON on port ${port} to ${host}${path}`);
  // Submit the request.
  client.request(getRequestOptions(`/api/${agent}/targets.html`), response => {
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
        const requestOptions = getRequestOptions(`/api/${agent}/issues.html/${timeStamp}/${jobID}`);
        // Submit a request for data on its issues.
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
      }
      catch (error) {
        console.log(error.message);
        console.log(`Targets response content: ${content || 'No content'}`);
      }
    });
  })
  // Finish sending the job request.
  .end(JSON.stringify({
    agentPW
  }));
};

// EXECUTION

// Execute the research agent.
requestService();
