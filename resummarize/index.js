/*
  index.js
  Resummarizes all reports.
*/

// IMPORTS

const {getJSON, reportsPath, summariesPath, summarizeReport} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Resummarizes all reports and returns an acknowledgement page.
exports.answer = async authCode => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // Get the report file names.
    const reportFiles = await fs.readdir(reportsPath);
    await fs.mkdir(summariesPath, {recursive: true});
    // For each report:
    for (const reportFile of reportFiles) {
      // Get a summary of it.
      const summary = await summarizeReport(reportFile);
      // Save the summary.
      await fs.writeFile(summariesPath, getJSON(summary));
    }
    // Get the answer template.
    let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
    const query = {
      summaryCount: reportFiles.length
    };
    // Replace its placeholders.
    Object.keys(query).forEach(param => {
      answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
    });
    // Return the populated page.
    return {
      status: 'ok',
      answerPage
    };
  }
  // Otherwise, i.e. if the authorization code is invalid, return an error page.
  return {
    status: 'error',
    error: 'Invalid authorization code'
  };
};
