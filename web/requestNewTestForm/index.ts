/*
  index.ts
  Serves a form for requesting a test.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';

// FUNCTIONS

export const answer = async (): Promise<{status: string; answerPage: string}> => {
  // Get the test request form template.
  const answerPage = await populateTemplate(import.meta.dirname, {});
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
