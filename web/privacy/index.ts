/*
  index.ts
  Serves the privacy policy.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns the privacy policy page.
export const answer = async () => {
  const answerPage = await populateTemplate(import.meta.dirname, {});
  return {
    status: 'ok',
    answerPage
  };
};
