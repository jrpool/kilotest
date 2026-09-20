/*
  index.ts
  Serves a form for deleting latest superseding reports.
*/

// IMPORTS

import {reportDeletionForm} from '../reportDeletion.ts';

// FUNCTIONS

// Returns a form for deleting latest superseding reports.
export const answer = async (_: any, search: string, method: string) => reportDeletionForm(import.meta.dirname, search, method, {
  intro: 'Choose the latest superseding reports to delete.',
  emptyIntro: 'Each target has only 1 report, so there are no reports to delete.',
  failurePrefix: 'Deleting latest superseding reports failed',
  isDeletable: (specs, index) => specs[index - 1]?.url === specs[index]?.url && specs[index + 1]?.url !== specs[index]?.url
});
