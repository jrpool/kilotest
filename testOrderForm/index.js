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
  const urls = Object.keys(recs);
  const margin = ' '.repeat(12);
  const lines = [];
  // For each page with any recommendations:
  urls.forEach(url => {
    // Add its URL to the lines.
    lines.push(`${margin}<li>${url}`);
    lines.push(`${margin}  <ul>`)
    // For each recommendation of the page:
    recs[url].forEach(rec => {
      const {what} = rec;
      const radio = `<input type="radio" name="target" value="${url}\t${what}">`;
      // Add a line with a radio button and the recommended page name.
      lines.push(`${margin}    <li>${radio} ${what}</li>`);
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
