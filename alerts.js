/*
  alerts.js
  Sends alert emails to the Kilotest manager.
*/

// IMPORTS

const fs = require('fs/promises');
const nodemailer = require('nodemailer');
const path = require('path');

// CONSTANTS

const balancePath = path.join(__dirname, 'anthropicBalance.json');
const MANAGER_EMAIL = process.env.MANAGER_EMAIL;
const WAVE_THRESHOLD = Number(process.env.WAVE_BALANCE_THRESHOLD) || 100;
const ANTHROPIC_THRESHOLD = Number(process.env.ANTHROPIC_BALANCE_THRESHOLD) || 5;
// Per-token prices in dollars (Haiku 4.5 defaults: $0.80/MTok input, $4/MTok output).
const INPUT_PRICE = Number(process.env.ANTHROPIC_INPUT_PRICE) || 0.0000008;
const OUTPUT_PRICE = Number(process.env.ANTHROPIC_OUTPUT_PRICE) || 0.000004;

// FUNCTIONS

// Sends an alert email to the manager.
const sendAlert = async (subject, body) => {
  if (!MANAGER_EMAIL) {
    console.log(`Alert suppressed (no MANAGER_EMAIL): ${subject}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: MANAGER_EMAIL,
    subject,
    text: body
  });
  console.log(`Alert sent: ${subject}`);
};

// Sends an alert for a manager event.
exports.alertManager = (event, context) => {
  if (event === 'testRec') {
    const {what, url, why} = context;
    sendAlert(
      'Kilotest: new test recommendation',
      `Page: ${what}\nURL: ${url}\nReason: ${why}`
    ).catch(error => console.log(`Alert error: ${error.message}`));
  }
  else if (event === 'issuelessRules') {
    const {rules} = context;
    sendAlert(
      'Kilotest: unclassified rule violations',
      `The following rules produced violations but are not in the issue map:\n${rules.join('\n')}`
    ).catch(error => console.log(`Alert error: ${error.message}`));
  }
};

// Checks a received report for alert conditions (Events 2 and 3).
exports.checkReportAlerts = async report => {
  // Event 2: WAVE balance.
  const waveAct = report.acts.find(act => act.type === 'test' && act.which === 'wave');
  const creditsRemaining = waveAct?.data?.creditsRemaining;
  if (typeof creditsRemaining === 'number' && creditsRemaining < WAVE_THRESHOLD) {
    await sendAlert(
      'Kilotest: WAVE balance low',
      `WAVE credits remaining: ${creditsRemaining} (threshold: ${WAVE_THRESHOLD}). One WAVE call costs 3 credits.`
    ).catch(error => console.log(`Alert error: ${error.message}`));
  }
  // Event 3: Anthropic balance.
  const testaroAct = report.acts.find(act => act.type === 'test' && act.which === 'testaro');
  const usage = testaroAct?.data?.ruleData?.allCaps?.anthropicUsage;
  if (usage) {
    const cost = usage.inputTokens * INPUT_PRICE + usage.outputTokens * OUTPUT_PRICE;
    try {
      const balanceData = JSON.parse(await fs.readFile(balancePath, 'utf8'));
      const newBalance = balanceData.balance - cost;
      await fs.writeFile(balancePath, `${JSON.stringify({balance: newBalance}, null, 2)}\n`);
      if (newBalance < ANTHROPIC_THRESHOLD) {
        await sendAlert(
          'Kilotest: Anthropic balance low',
          `Estimated remaining Anthropic balance: $${newBalance.toFixed(2)} (threshold: $${ANTHROPIC_THRESHOLD}). Top up at console.anthropic.com.`
        ).catch(error => console.log(`Alert error: ${error.message}`));
      }
    }
    catch {
      // No balance file initialized; skip check.
    }
  }
};
