/*
  index.ts
  Serves a form for renewing the WCAG map.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns a form for renewing the WCAG map.
export const answer = async (): Promise<{status: string; answerPage: string}> => {
  // Get the map renewal form.
  const answerPage = await populateTemplate(import.meta.dirname, {});
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
