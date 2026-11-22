/*
  index.ts
  Serves the about Kilotest exemplars page.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns the about Kilotest exemplars page.
export const answer = async () => {
  const answerPage = await populateTemplate(import.meta.dirname, {});
  return {
    status: 'ok',
    answerPage
  };
};
