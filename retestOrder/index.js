/*
  index.js
  Tests a target.
*/

// IMPORTS

const {getLog} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Starts a retest and returns an acknowledgement page.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const targetWhat = log.pageWhat;
  const query = {
    target: targetWhat
  };
  // Log the order.
  console.log(`Retest ordered and started for ${targetWhat}`);
  // Start the ordered retest.
  // Get the template.
  let answerPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
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
