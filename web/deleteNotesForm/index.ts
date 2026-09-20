/*
  index.ts
  Serves a form for deleting web tutorial comments, AI tutorial comments, and MCP
  feature requests, the three kinds of notes that Kilotest records to flat JSON files
  rather than presenting through any other manager page.
*/

// IMPORTS

import {errorMessage, getDateTimeString, getJSON, getPlainText, isValidAuthCode, populateTemplate} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// TYPES

// A note (comment or feature request) as stored in one of the note files.
type Note = {
  timeStamp: string;
  content: string;
};

// The source of a kind of note, identifying its file and how it is labeled.
type NoteSource = {
  name: string;
  label: string;
  getPath: () => string;
};

// CONSTANTS

// The note sources, in the order they are listed on the form. Each source's path is
// read afresh on every call, via its own environment-variable override, exactly as
// web/tutorialWeb/index.ts and web/tutorialAI/index.ts already do for their own
// comment files, so that tests can point any of them at a fixture path.
const noteSources: NoteSource[] = [
  {
    name: 'tutorialWeb',
    label: 'Web tutorial comment',
    getPath: () => process.env.TUTORIAL_WEB_COMMENTS_PATH ||
      path.join(import.meta.dirname, '../../db/comments/tutorialWeb.json')
  },
  {
    name: 'tutorialAI',
    label: 'AI tutorial comment',
    getPath: () => process.env.TUTORIAL_AI_COMMENTS_PATH ||
      path.join(import.meta.dirname, '../../db/comments/tutorialAI.json')
  },
  {
    name: 'featureRequest',
    label: 'MCP feature request',
    getPath: () => process.env.FEATURE_REQUESTS_PATH ||
      path.join(import.meta.dirname, '../../db/featureRequests.json')
  }
];

// FUNCTIONS (helpers)

// Returns the notes in a source's file, or an empty array if it does not exist.
const getNotes = async (source: NoteSource): Promise<Note[]> => {
  try {
    const existing = await fs.readFile(source.getPath(), 'utf8');
    return JSON.parse(existing);
  }
  catch {
    return [];
  }
};

// FUNCTIONS

// Returns a form for deleting selected notes, or, on a POST request with a valid
// authorization code, deletes the selected notes and returns the form again. A GET
// request never processes a submission, regardless of its query string; only a POST
// request (the form's own submission) does.
export const answer = async (
  _: any, search: string, method: string
): Promise<{status: string; message?: string; answerPage?: string}> => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  // Each selected checkbox's value is `${sourceName}\t${timeStamp}`.
  const selections = searchParams?.getAll('note');
  // If the form has been submitted and any notes are to be deleted:
  if (method === 'POST' && selections?.length) {
    // If the authorization code is valid:
    if (isValidAuthCode(authCode)) {
      // Group the selected time stamps by source.
      const timeStampsBySource = new Map<string, Set<string>>();
      for (const selection of selections) {
        const [sourceName, timeStamp] = selection.split('\t') as [string, string];
        if (!timeStampsBySource.has(sourceName)) {
          timeStampsBySource.set(sourceName, new Set());
        }
        timeStampsBySource.get(sourceName)!.add(timeStamp);
      }
      try {
        // For each source with any selected notes:
        for (const source of noteSources) {
          const timeStamps = timeStampsBySource.get(source.name);
          if (!timeStamps) {
            continue;
          }
          // Remove the selected notes and save the rest.
          const notes = await getNotes(source);
          const remaining = notes.filter(note => !timeStamps.has(note.timeStamp));
          await fs.mkdir(path.dirname(source.getPath()), {recursive: true});
          await fs.writeFile(source.getPath(), getJSON(remaining));
        }
      }
      // If this failed:
      catch (error: unknown) {
        // Return why.
        return {
          status: 'error',
          message: `Deleting notes failed (${errorMessage(error)})`
        };
      }
    }
    // Otherwise, i.e. if the authorization code is invalid:
    else {
      // Report the error, deliberately vague so as not to confirm to an attacker that the
      // authorization code specifically (as opposed to some other part of the request) is
      // what was wrong.
      return {
        status: 'error',
        message: 'Invalid request'
      };
    }
  }
  const lines: string[] = [];
  const margin = ' '.repeat(12);
  let anyNotes = false;
  // For each source, in display order:
  for (const source of noteSources) {
    const notes = await getNotes(source);
    // For each of its notes, oldest first:
    for (const note of notes) {
      anyNotes = true;
      const value = `${source.name}\t${note.timeStamp}`;
      const when = getDateTimeString(note.timeStamp);
      lines.push(
        `${margin}<p><input type="checkbox" name="note" value="${value}"> ` +
        `<strong>${source.label}</strong> (${when}): ${getPlainText(note.content)}</p>`
      );
    }
  }
  const query: Record<string, string> = {
    notes: lines.join('\n'),
    intro: anyNotes ?
      'Choose the comments and feature requests to delete.' :
      'There are no comments or feature requests to delete.',
    disabled: anyNotes ? '' : ' disabled'
  };
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, query)
  };
};
