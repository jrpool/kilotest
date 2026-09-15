/*
  index.ts
  Serves the AI agent tutorial (Connect an AI Platform to Kilotest) and saves AI tutorial comments.
*/

// IMPORTS

import {sendAlert} from '../../alerts.ts';
import {checkCommentLength, getJSON} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS (helpers)

const getCommentsPath = () => process.env.TUTORIAL_AI_COMMENTS_PATH || path.join(import.meta.dirname, '../../db/comments/tutorialAI.json');

// FUNCTIONS

// Strips HTML tags and control characters, trims, and limits to 1000 characters.
const sanitize = (str: string) => str
  .replace(/<[^>]*>/g, '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .trim()
  .slice(0, 1000);

// Returns the AI tutorial page.
export const answer = async () => {
  const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  return {
    status: 'ok',
    answerPage
  };
};

// Sanitizes and saves an AI tutorial comment to comments.json.
export const handleComment = async (content: unknown) => {
  if (!content || typeof content !== 'string') {
    return {status: 'error', message: 'No content provided'};
  }
  // Check length on the raw content.
  const lengthCheck = checkCommentLength(content);
  if (lengthCheck.status === 'error') {
    return lengthCheck;
  }
  const commentsPath = getCommentsPath();
  let comments: any[] = [];
  try {
    const existing = await fs.readFile(commentsPath, 'utf8');
    comments = JSON.parse(existing);
  }
  catch {
    // Initialize empty comments array.
  }
  const sanitized = sanitize(content);
  if (!sanitized) {
    return {status: 'error', message: 'Comment is empty after sanitization'};
  }
  // Check for duplicate submissions within the last 1000 seconds.
  const duplicates = comments
  .filter(comment => new Date(comment.dateTime).getTime() > Date.now() - 1000000)
  .filter(comment => comment.content === sanitized);
  if (duplicates.length) {
    return {
      status: 'error',
      message: 'Your comment repeats a recently submitted one, but you are welcome to submit a different comment'
    };
  }
  // Add the comment to the existing ones, using dateTime format.
  comments.push({
    dateTime: new Date().toISOString(),
    content: sanitized
  });
  // Ensure the comments directory exists.
  await fs.mkdir(path.dirname(commentsPath), {recursive: true});
  // Save the revised comments.
  await fs.writeFile(commentsPath, getJSON(comments));
  // Send an alert to the manager.
  await sendAlert('New AI tutorial comment received', 'A new AI tutorial comment has been received.');
  return {status: 'ok'};
};
