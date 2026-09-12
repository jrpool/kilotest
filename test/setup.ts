/*
  test/setup.ts
  Clears alert configuration env vars before any modules are required,
  so that tests calling sendAlert indirectly never trigger real email alerts.
  This file is loaded via --require before any test file runs.

  The env vars are set to empty strings rather than deleted, because
  dotenv does not override existing env vars. This prevents the .env
  file loaded by index.ts from re-arming the alert configuration.
*/

for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}
