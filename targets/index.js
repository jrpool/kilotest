/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const fs = require('fs/promises');

// FUNCTIONS

// Returns a date string from a time stamp.
const getDateString = timeStamp =>
  `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}`;
// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const logNames = await fs.readdir('./logs');
  // Initialize a directory of tested targets.
  const targetDirectory = {};
  // For each log:
  for (const logName of logNames) {
    const logJSON = await fs.readFile(`./logs/${logName}`, 'utf8');
    const log = JSON.parse(logJSON);
    // Add its data to the targets directory, replacing any entry for the same target URL.
    targetDirectory[log.pageURL] = log;
  }
  // Get an array of target data sorted by description.
  const targets = Object
  .values(targetDirectory)
  .sort((a, b) => a.pageWhat.localeCompare(b.pageWhat, 'en', {sensitivity: 'accent'}));
  const itemLines = [];
  const margin = ' '.repeat(6);
  // Get an array of HTML list items describing the targets.
  targets.forEach(target => {
    const {pageURL, pageWhat, timeStamp} = target;
    itemLines.push(`${margin}<li>${pageWhat}</li>`);
    itemLines.push(`${margin}  <ul>`);
    itemLines.push(`${margin}    <li>URL: ${pageURL}</li>`);
    itemLines.push(`${margin}    <li>Last tested: ${getDateString(timeStamp)}</li>`);
    itemLines.push(`${margin}  </ul>`);
    itemLines.push(`${margin}</li>`)
  });
  query.itemLines = itemLines;
};
// Returns a page answering the targets question.
exports.targetsRequestHandler = async (request, response) => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // Get the template.
  let template = await fs.readFile(`${__dirname}/index.html`, 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    template = template.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return template;
};
