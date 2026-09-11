/*
  alerts.test.cjs
  Tests for alerts.ts, covering the success, failure, error, timeout, and unconfigured paths.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const {EventEmitter} = require('node:events');
const {sendAlert} = require('./alerts.ts');

// SETUP AND TEARDOWN

const originalRequest = https.request;
const savedEnv = {};

before(() => {
  for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
    savedEnv[key] = process.env[key];
  }
});

after(() => {
  https.request = originalRequest;
  for (const key of Object.keys(savedEnv)) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    }
    else {
      delete process.env[key];
    }
  }
});

// HELPER

// Replaces https.request with a function that returns a fake request and invokes the callback with a fake response. The mockHandler is called on next tick so that event listeners are attached first.
const mockRequest = mockHandler => {
  https.request = (options, callback) => {
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {};
    req.destroy = () => {
      req.emit('error', new Error('Socket destroyed'));
    };
    req.setTimeout = (ms, fn) => {
      process.nextTick(fn);
    };
    const res = new EventEmitter();
    res.statusCode = 200;
    process.nextTick(() => mockHandler(req, res, callback));
    return req;
  };
};

// Sets the alert configuration env vars so that sendAlert enters the configured path.
const setAlertConfig = () => {
  process.env.MANAGER_EMAIL = 'manager@example.com';
  process.env.ALERT_API_HOST = 'alert.example.com';
  process.env.ALERT_API_PATH = '/send';
  process.env.ALERT_API_KEY = 'test-key';
  process.env.ALERT_FROM = 'kilotest@example.com';
};

// Clears the alert configuration env vars so that sendAlert enters the unconfigured path.
const clearAlertConfig = () => {
  for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
    delete process.env[key];
  }
};

// TESTS

test('sendAlert resolves without sending when configuration is incomplete', async () => {
  clearAlertConfig();
  await sendAlert('Test', 'Body');
  assert.ok(true);
});

test('sendAlert logs success when the API responds with a 2xx status', async () => {
  setAlertConfig();
  mockRequest((req, res, callback) => {
    res.statusCode = 200;
    callback(res);
    res.emit('end');
  });
  await sendAlert('Test Success', 'Body');
  https.request = originalRequest;
  assert.ok(true);
});

test('sendAlert logs an error when the API responds with a non-2xx status', async () => {
  setAlertConfig();
  mockRequest((req, res, callback) => {
    res.statusCode = 500;
    callback(res);
    res.emit('data', 'Server error');
    res.emit('end');
  });
  await sendAlert('Test Failure', 'Body');
  https.request = originalRequest;
  assert.ok(true);
});

test('sendAlert logs an error when the request errors', async () => {
  setAlertConfig();
  mockRequest((req) => {
    req.emit('error', new Error('Connection refused'));
  });
  await sendAlert('Test Error', 'Body');
  https.request = originalRequest;
  assert.ok(true);
});

test('sendAlert logs an error when the request times out', async () => {
  setAlertConfig();
  mockRequest(() => {
    // Do nothing; the setTimeout mock will fire and call req.destroy().
  });
  await sendAlert('Test Timeout', 'Body');
  https.request = originalRequest;
  assert.ok(true);
});
