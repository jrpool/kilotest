/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getJSON, getLog, getTimeStamp} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Records a retest recommendation and returns an acknowledgement page.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const log = await getLog(timeStamp, jobID);
  const targetWhat = log.pageWhat;
  const wantsJSON = await fs.readFile(`${__dirname}/wants.json`, 'utf8');
  const wants = JSON.parse(wantsJSON);
  wants[targetWhat] ??= [];
  wants[targetWhat].push(getTimeStamp(new Date()));
  await fs.writeFile(`${__dirname}/wants.json`, getJSON(wants));
  const query = {
    target: targetWhat
  };
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
