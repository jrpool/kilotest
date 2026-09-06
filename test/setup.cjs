/*
  test/setup.cjs
  Clears alert configuration env vars before any modules are required,
  so that tests calling sendAlert indirectly never trigger real email alerts.
  This file is loaded via --require before any test file runs.
*/

for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  delete process.env[key];
}
