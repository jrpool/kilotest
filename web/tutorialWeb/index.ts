/*
  index.ts
  Serves the web tutorial and saves web tutorial comments.
*/

// IMPORTS

import {sendAlert} from '../../alerts.ts';
import {checkCommentDuplicate, checkCommentLength, getJSON, getNowStamp} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS (helpers)

const getCommentsPath = () => process.env.TUTORIAL_WEB_COMMENTS_PATH || path.join(import.meta.dirname, '../../db/comments/tutorialWeb.json');

// FUNCTIONS

// Strips HTML tags and control characters, trims, and limits to 1000 characters.
const sanitize = (str: string) => str
  .replace(/<[^>]*>/g, '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .trim()
  .slice(0, 1000);

// Returns the tutorial page.
export const answer = async () => {
  const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  return {
    status: 'ok',
    answerPage
  };
};
// Sanitizes and saves a tutorial comment to comments.json.
export const handleComment = async (content: unknown) => {
  if (!content || typeof content !== 'string') {
    return {status: 'error', message: 'No content provided'};
  }
  // If the raw comment's length is invalid:
  const lengthCheck = checkCommentLength(content);
  if (lengthCheck.status === 'error') {
    // Report this.
    return lengthCheck;
  }
  const commentsPath = getCommentsPath();
  let comments: any[] = [];
  try {
    // Get the existing comments.
    const existing = await fs.readFile(commentsPath, 'utf8');
    comments = JSON.parse(existing);
  }
  // If there are none:
  catch {
    // Initialize a comments array.
  }
  const sanitized = sanitize(content);
  if (!sanitized) {
    return {status: 'error', message: 'Comment is empty after sanitization'};
  }
  // If the sanitized comment duplicates one recently stored:
  const duplicateCheck = checkCommentDuplicate(comments, sanitized);
  if (duplicateCheck.status === 'error') {
    // Report this.
    return duplicateCheck;
  }
  // Add the comment to the existing ones.
  comments.push({
    timeStamp: getNowStamp(),
    content: sanitized
  });
  // Ensure the comments directory exists.
  await fs.mkdir(path.dirname(commentsPath), {recursive: true});
  // Save the revised comments.
  await fs.writeFile(commentsPath, getJSON(comments));
  // Send an alert to the manager.
  await sendAlert('New web tutorial comment received', 'A new web tutorial comment has been received.');
  return {status: 'ok'};
};
