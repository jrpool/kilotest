/*
  smokeTest.cjs
  Sends requests to all valid GET and POST paths on the deployed server and verifies that Caddy forwards them to Kilotest (i.e., the response is not a bare Caddy 404).
*/

// IMPORTS

const https = require('https');
const {routes} = require('./index.ts');

// CONSTANTS

// Concrete paths matching each wildcard pattern in the routes table, for smoke testing.
const concretePaths = {
  GET: {
    '*.html*': '/listReports.html',
    '/': '/',
    '/api-docs': '/api-docs',
    '/api/*': '/api/listReports',
    '/capability.md': '/capability.md',
    '/favicon.*': '/favicon.ico',
    '/fullReport.json/*': '/fullReport.json/260101T0000/mix',
    '/index.html': '/index.html',
    '/llms-full.txt': '/llms-full.txt',
    '/llms.txt': '/llms.txt',
    '/mcp': '/mcp',
    '/openapi.json': '/openapi.json',
    '/openapi.yaml': '/openapi.yaml',
    '/robots.txt': '/robots.txt',
    '/sitemap.xml': '/sitemap.xml',
    '/style.css': '/style.css',
    '/swagger.json': '/swagger.json',
    '/swagger.yaml': '/swagger.yaml',
    '/tutorial/images/*': '/tutorial/images/diagram.png'
  },
  POST: {
    '/api/*': '/api/requestFeature',
    '/mcp': '/mcp',
    '/reannotate.html': '/reannotate.html',
    '/recAction.html': '/recAction.html',
    '/renewWCAG.html': '/renewWCAG.html',
    '/requestRetest.html/*': '/requestRetest.html/260101T0001/ct',
    '/requestTest.html': '/requestTest.html',
    '/tutorialComment.html': '/tutorialComment.html',
    '/worker/job': '/worker/job',
    '/worker/report': '/worker/report'
  }
};
// Minimal POST bodies for paths that require them.
const postBodies = {
  '/api/requestFeature': {feature: 'smoke test'},
  '/mcp': {},
  '/reannotate.html': {authCode: 'invalid'},
  '/recAction.html': {
    target: 'https://smoketest.example.com\tSmoke Test Page', authCode: 'invalid'
  },
  '/renewWCAG.html': {authCode: 'invalid'},
  '/requestRetest.html/260101T0001/ct': {why: 'smoke test'},
  '/requestTest.html': {what: 'Smoke Test Page', url: 'https://smoketest.example.com', why: 'smoke test'},
  '/tutorialComment.html': {content: 'smoke test'},
  '/worker/job': {},
  '/worker/report': {}
};

// FUNCTIONS

// Sends an HTTPS request and returns the status code and body length.
const sendRequest = (method, requestPath) => new Promise((resolve, reject) => {
  const body = method === 'POST' ? JSON.stringify(postBodies[requestPath] || {}) : null;
  const headers = {'x-kilotest-smoke': '1'};
  if (body) {
    headers['content-type'] = 'application/json; charset=utf-8';
    headers['content-length'] = Buffer.byteLength(body);
  }
  const options = {
    method,
    host: process.env.SMOKE_HOST || 'kilotest.com',
    path: requestPath,
    headers
  };
  const req = https.request(options, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      const responseBody = chunks.join('');
      resolve({statusCode: response.statusCode, bodyLength: responseBody.length});
    });
  });
  req.on('error', reject);
  req.end(body || '');
});

// Returns whether a response is a bare Caddy 404 (the failure this test detects).
const isCaddy404 = result => result.statusCode === 404 && result.bodyLength === 0;

// EXECUTION

(async () => {
  let failures = 0;
  for (const method of ['GET', 'POST']) {
    console.log(`\n=== ${method} paths ===`);
    for (const pattern of routes[method]) {
      const requestPath = concretePaths[method][pattern];
      if (!requestPath) {
        console.log(`FAIL: no concrete path defined for pattern ${pattern}`);
        failures++;
        continue;
      }
      try {
        const result = await sendRequest(method, requestPath);
        if (isCaddy404(result)) {
          console.log(`FAIL: ${method} ${requestPath} -> Caddy 404 (path not forwarded)`);
          failures++;
        }
        else {
          console.log(`PASS: ${method} ${requestPath} -> ${result.statusCode} (body ${result.bodyLength} bytes)`);
        }
      }
      catch (error) {
        console.log(`FAIL: ${method} ${requestPath} -> error: ${error.message}`);
        failures++;
      }
    }
  }
  console.log(`\n=== ${failures === 0 ? 'All paths forwarded' : `${failures} failure(s)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
})();
