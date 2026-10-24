/*
  index.ts
  Serves the Kilotest demonstration page.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns the demonstration page.
export const answer = async () => {
  const answerPage = await populateTemplate(import.meta.dirname, {});
  return {
    status: 'ok',
    answerPage
  };
};
