/*
  index.js
  Serves a form for ordering a recommended test.
*/

// IMPORTS

const {getAgoString, getDateTimeString, getRecs} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a test order form.
exports.answer = async () => {
  const recs = await getRecs();
  const pageURLs = Object.keys(recs);
  const margin = ' '.repeat(12);
  const lines = [];
  // For each page with any recommendations:
  pageURLs.forEach(pageURL => {
    // Add its URL to the lines.
    lines.push(`${margin}<li>${pageURL}`);
    lines.push(`${margin}  <ul>`)
    // For each recommendation of the page:
    recs[pageURL].forEach(rec => {
      const radio = `<input type="radio" name="target" value="${pageURL}\t${rec.pageWhat}">`;
      // Add a line with a radio button and the recommended page name.
      lines.push(`${margin}    <li>${radio} ${rec.pageWhat}</li>`);
    });
  });
  const query = {
    recs: lines.join('\n')
  };
  // Get the order form template.
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
