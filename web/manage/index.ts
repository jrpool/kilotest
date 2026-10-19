/*
  index.ts
  Lists the actions that managers can take.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns the answer page.
export const answer = async (): Promise<{status: string; answerPage: string}> => {
  // Get the answer page.
  const answerPage = await populateTemplate(import.meta.dirname, {});
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
