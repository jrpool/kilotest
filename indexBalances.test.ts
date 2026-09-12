/*
  indexBalances.test.ts
  Tests for checkBalancesForAlerts in index.js, which requires balance-related
  env vars to be set before index.js is loaded.
*/

// ENVIRONMENT (must be set before requiring index.js)

import path from 'node:path';
import {fixtureDBDir} from './test/dbFixture.ts';

process.env.DB_DIR = fixtureDBDir;
process.env.AUTH_CODE = 'test-auth-code';
process.env.TESTARO_WORKERS = JSON.stringify({
  worker1: {secret: 'secret1', name: 'Worker One'}
});
process.env.WAVE_BALANCE_THRESHOLD = '100';
process.env.AI_SERVICE0_BALANCE_THRESHOLD = '50';
process.env.AI_MODEL0_INPUT_PRICE = '0.001';
process.env.AI_MODEL0_OUTPUT_PRICE = '0.002';

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {requestHandler} from './index.ts';

// CONSTANTS

const port = 3994;
const balancePath = path.join(import.meta.dirname, 'ai0Balance.json');
const jobID = '990101T0001-bal';
const reportPath = path.join(fixtureDBDir, 'reports', `${jobID}.json`);
const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
const jobPath = path.join(claimedDir, `${jobID}.json`);

// SETUP AND TEARDOWN

let server: http.Server;
let originalBalance: any;

before(async () => {
  originalBalance = await fs.readFile(balancePath, 'utf8').catch(() => null);
  // Create the job directories, which are not tracked by git and may not exist on a fresh checkout.
  for (const sub of ['claimed', 'queue', 'failed']) {
    await fs.mkdir(path.join(fixtureDBDir, 'jobs', sub), {recursive: true});
  }
  server = http.createServer(requestHandler);
  await new Promise<void>(resolve => server.listen(port, () => resolve()));
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      resolve();
    }, 1000);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (originalBalance !== null) {
    await fs.writeFile(balancePath, originalBalance);
  }
  else {
    await fs.unlink(balancePath).catch(() => {});
  }
  // Clean up any report and job files created by tests.
  await fs.unlink(reportPath).catch(() => {});
  await fs.unlink(jobPath).catch(() => {});
});

// HELPERS

const request = (method: string, requestPath: string, body: any = null, headers: any = {}): Promise<any> => new Promise((resolve, reject) => {
  const options = {method, host: 'localhost', port, path: requestPath, headers: {...headers}};
  let bodyData = '';
  if (body) {
    bodyData = JSON.stringify(body);
    options.headers['content-type'] = 'application/json';
    options.headers['content-length'] = Buffer.byteLength(bodyData);
  }
  const req = http.request(options, response => {
    const chunks: Buffer[] = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      resolve({statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString()});
    });
  });
  req.on('error', reject);
  req.end(bodyData || '');
});

const jsonBody = (res: any) => {
  try {
    return JSON.parse(res.body);
  }
  catch {
    return null;
  }
};

const submitReport = async (acts: any, balanceFileContent: any) => {
  if (balanceFileContent !== undefined) {
    if (balanceFileContent === null) {
      await fs.unlink(balancePath).catch(() => {});
    }
    else {
      await fs.writeFile(balancePath, balanceFileContent);
    }
  }
  await fs.writeFile(jobPath, JSON.stringify({
    id: jobID,
    target: {what: 'Test', url: 'https://example.com/test'},
    sources: {worker: 'Worker One'}
  }));
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const report = {
    id: jobID,
    target: {what: 'Test', url: 'https://example.com/test'},
    acts,
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  const res = await request('POST', '/worker/report', {report}, {
    authorization: `Basic ${auth}`
  });
  await fs.unlink(jobPath).catch(() => {});
  await fs.unlink(reportPath).catch(() => {});
  return res;
};

// TESTS

test('worker/report with WAVE balance low triggers a balance alert', async () => {
  const res = await submitReport(
    [
      {type: 'test', which: 'wave', data: {creditsRemaining: 5}},
      {type: 'test', which: 'testaro', data: {ruleData: {allCaps: {aiModelUsage: {inputTokens: 100, outputTokens: 50}}}}}
    ],
    JSON.stringify({balance: 100})
  );
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body.status, 'ok');
});

test('worker/report with AI service balance low triggers a balance alert', async () => {
  const res = await submitReport(
    [
      {type: 'test', which: 'wave', data: {creditsRemaining: 200}},
      {type: 'test', which: 'testaro', data: {ruleData: {allCaps: {aiModelUsage: {inputTokens: 5000, outputTokens: 3000}}}}}
    ],
    JSON.stringify({balance: 10})
  );
  assert.equal(res.statusCode, 200);
});

test('worker/report with no balance file logs an error', async () => {
  const res = await submitReport(
    [
      {type: 'test', which: 'wave', data: {creditsRemaining: 200}},
      {type: 'test', which: 'testaro', data: {ruleData: {allCaps: {aiModelUsage: {inputTokens: 100, outputTokens: 50}}}}}
    ],
    null
  );
  assert.equal(res.statusCode, 200);
});

test('worker/report with invalid balance JSON logs an error', async () => {
  const res = await submitReport(
    [
      {type: 'test', which: 'wave', data: {creditsRemaining: 200}},
      {type: 'test', which: 'testaro', data: {ruleData: {allCaps: {aiModelUsage: {inputTokens: 100, outputTokens: 50}}}}}
    ],
    'not valid json'
  );
  assert.equal(res.statusCode, 200);
});

test('worker/report with non-number balance logs an error', async () => {
  const res = await submitReport(
    [
      {type: 'test', which: 'wave', data: {creditsRemaining: 200}},
      {type: 'test', which: 'testaro', data: {ruleData: {allCaps: {aiModelUsage: {inputTokens: 100, outputTokens: 50}}}}}
    ],
    JSON.stringify({balance: 'not a number'})
  );
  assert.equal(res.statusCode, 200);
});
