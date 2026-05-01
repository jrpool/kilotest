/*
  alerts.js
  Sends alert emails to a Kilotest manager when required.
*/

// IMPORTS

const nodemailer = require('nodemailer');

// CONSTANTS

// Email configuration.
const MANAGER_EMAIL = process.env.MANAGER_EMAIL;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// FUNCTIONS

// Sends an email alert to a manager.
exports.sendAlert = async (subject, body) => {
  // If the email configuration is complete:
  if (MANAGER_EMAIL && SMTP_HOST && SMTP_USER && SMTP_PASS) {
    // Create a transporter.
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(SMTP_PORT),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    // Use it to send the specified alert.
    await transporter.sendMail({
      from: SMTP_USER,
      to: MANAGER_EMAIL,
      subject,
      text: body
    });
    console.log(`Alert on ${subject} sent`);
  }
  // Otherwise, i.e. if the email configuration is incomplete:
  else {
    // Report this.
    console.log(
      `WARNING (${subject}): ${body}\nERROR: Email configuration incomplete, so no alert sent`
    );
  }
};
