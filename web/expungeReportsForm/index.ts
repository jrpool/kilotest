/*
  index.ts
  Serves a form for deleting sole reports.
*/

// IMPORTS

import {reportDeletionForm} from '../reportDeletion.ts';

// FUNCTIONS

// Returns a form for deleting sole reports.
export const answer = async (_: any, search: string) => reportDeletionForm(import.meta.dirname, search, {
  intro: 'Choose the sole reports to delete.',
  emptyIntro: 'Each target has at least 2 reports, so there are no reports to delete.',
  failurePrefix: 'Deleting sole reports failed',
  isDeletable: (specs, index) => specs[index - 1]?.url !== specs[index]?.url && specs[index + 1]?.url !== specs[index]?.url
});
