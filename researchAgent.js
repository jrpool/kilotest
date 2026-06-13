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

const agentPW = process.env.RESEARCH_AGENT_PW;
const kilotestHosts = [process.env.LOCAL_KILOTEST_HOST, process.env.DEPLOYED_KILOTEST_HOST];
// Randomly chosen Kilotest host.
const kilotestHost = kilotestHosts[Math.random() < 0.5 ? 0 : 1];
const hostParts = kilotestHost.split(/:\/*/);
const scheme = hostParts[0];
const host = hostParts[1];
const port = hostParts[2] || (scheme === 'https' ? 443 : 80);
const services = ['reportIssues'];
// Randomly chosen service.
const service = services[Math.floor(services.length * Math.random())];
const logs = await getLogs();
// Randomly chosen log.
const log = logs[Math.floor(logs.length * Math.random())];
const pathname = `${service}/${log.jobName.split('-').join('/')}`;

// FUNCTIONS

// Submits a random research request to a random Kilotest host.
const requestService = async () => {
  const client = kilotestHost.startsWith('https') ? httpsClient : httpClient;
  const clientType = client === httpsClient ? 'HTTPS' : 'HTTP';
  // Use its job name in the request path.
  const requestOptions = {
    method: 'POST',
    headers: {
      host,
      port,
      pathname,
      'content-type': 'application/json; charset=utf-8'
    }
  };
  console.log(`About to submit ${clientType} request on port ${port} to ${host}/${pathname}`);
  // Submit a request.
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
      // Output it.
      console.log(JSON.stringify(JSON.parse(content), null, 2));
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
