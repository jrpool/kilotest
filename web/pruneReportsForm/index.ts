/*
  index.ts
  Serves a form for deleting superseded reports.
*/

// IMPORTS

import {reportDeletionForm} from '../reportDeletion.ts';

// FUNCTIONS

// Returns a form for deleting non-latest reports.
export const answer = async (_: any, search: string) => reportDeletionForm(import.meta.dirname, search, {
  intro: 'Choose the superseded reports to delete.',
  emptyIntro: 'Each target has only 1 report, so there are no superseded reports to delete.',
  failurePrefix: 'Deleting superseded reports failed',
  isDeletable: (specs, index) => specs[index + 1]?.url === specs[index].url
});
