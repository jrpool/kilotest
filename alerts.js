/*
  alerts.js
  Sends alert emails to a Kilotest manager when required.
*/

// IMPORTS

const https = require('https');

// CONSTANTS

// Alert configuration.
const MANAGER_EMAIL = process.env.MANAGER_EMAIL;
const ALERT_API_HOST = process.env.ALERT_API_HOST;
const ALERT_API_PATH = process.env.ALERT_API_PATH;
const ALERT_API_KEY = process.env.ALERT_API_KEY;
const ALERT_FROM = process.env.ALERT_FROM;

// FUNCTIONS

// Sends an email alert to a manager.
exports.sendAlert = (subject, body) => new Promise((resolve, reject) => {
  // If the alert configuration is complete:
  if (MANAGER_EMAIL && ALERT_API_HOST && ALERT_API_PATH && ALERT_API_KEY && ALERT_FROM) {
    const payload = JSON.stringify({
      from: ALERT_FROM,
      to: [MANAGER_EMAIL],
      subject,
      text: body
    });
    const req = https.request({
      hostname: ALERT_API_HOST,
      path: ALERT_API_PATH,
      method: 'POST',
      headers: {
        'authorization': `Bearer ${ALERT_API_KEY}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`Alert sent (${subject})`);
        }
        else {
          console.log(`ERROR: Alert API responded ${res.statusCode}: ${data}`);
        }
        resolve();
      });
    });
    req.on('error', error => {
      console.log(`ERROR: Alert API error: ${error.message}`);
      resolve();
    });
    req.setTimeout(10000, () => {
      req.destroy();
      console.log('ERROR: Alert API timeout');
      resolve();
    });
    req.write(payload);
    req.end();
  }
  // Otherwise, i.e. if the alert configuration is incomplete:
  else {
    // Report this.
    console.log(
      `WARNING (${subject}): ${body}\nERROR: Alert configuration incomplete, so no alert sent`
    );
    resolve();
  }
});
