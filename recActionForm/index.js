/*
  index.js
  Serves a form for ordering a recommended test.
*/

// IMPORTS

const {getRecs} = require('../util');
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
    // Add a radio button and its URL to the lines.
    lines.push(`${margin}<h2><input type="radio" name="target" value="${url}" required> ${url}</h2>`);
    // Get the recommended target names for the page.
    const targetNames = new Set(recs[url].map(rec => rec.what));
    // For each recommended target name:
    targetNames.forEach(what => {
      const radio = `<input type="radio" name="target" value="${url}\t${what}" required>`;
      // Add a radio button and the recommended page name to the lines.
      lines.push(`${margin}    <p>${radio} ${what}</p>`);
    });
  });
  const query = {
    recs: lines.join('\n'),
    noRecs: urls.length ? '' : 'No recommendations exist now.',
    disabled: urls.length ? '' : ' disabled'
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
