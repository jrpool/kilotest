/*
  index.js
  Answers the tutorial request and saves tutorial comments.
*/

// IMPORTS

const {sendAlert} = require('../alerts');
const {getJSON, getNowStamp} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// CONSTANTS

const commentsPath = path.join(__dirname, 'comments.json');

// FUNCTIONS

// Strips HTML tags and control characters, trims, and limits to 500 characters.
const sanitize = str => str
  .replace(/<[^>]*>/g, '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .trim()
  .slice(0, 500);

// Returns the tutorial page.
exports.answer = async () => {
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  return {
    status: 'ok',
    answerPage
  };
};
// Sanitizes and saves a tutorial comment to comments.json.
exports.handleComment = async content => {
  if (!content || typeof content !== 'string') {
    return {status: 'error', message: 'No content provided'};
  }
  const sanitized = sanitize(content);
  if (!sanitized) {
    return {status: 'error', message: 'Comment is empty after sanitization'};
  }
  let comments = [];
  try {
    // Get the existing comments.
    const existing = await fs.readFile(commentsPath, 'utf8');
    comments = JSON.parse(existing);
  }
  // If there are none:
  catch {
    // Initialize a comments array.
  }
  // Add the comment to the existing ones.
  comments.push({
    timeStamp: getNowStamp(),
    content: sanitized
  });
  // Save the revised comments.
  await fs.writeFile(commentsPath, getJSON(comments));
  // Send an alert to the manager.
  await sendAlert('New tutorial comment received', 'A new tutorial comment has been received.');
  return {status: 'ok'};
};
