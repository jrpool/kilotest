/*
  index.ts
  Serves the tutorial and saves tutorial comments.
*/

// IMPORTS

import {sendAlert} from '../../alerts.ts';
import {getJSON, getNowStamp} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// CONSTANTS

const commentsPath = path.join(import.meta.dirname, 'comments.json');

// FUNCTIONS

// Strips HTML tags and control characters, trims, and limits to 500 characters.
const sanitize = (str: string) => str
  .replace(/<[^>]*>/g, '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .trim()
  .slice(0, 500);

// Returns the tutorial page.
export const answer = async () => {
  let answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  return {
    status: 'ok',
    answerPage
  };
};
// Sanitizes and saves a tutorial comment to comments.json.
export const handleComment = async (content: any) => {
  if (!content || typeof content !== 'string') {
    return {status: 'error', message: 'No content provided'};
  }
  const sanitized = sanitize(content);
  if (!sanitized) {
    return {status: 'error', message: 'Comment is empty after sanitization'};
  }
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
