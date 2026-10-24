/*
  index.ts
  Serves the terms of service.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns the terms of service page.
export const answer = async () => {
  const answerPage = await populateTemplate(import.meta.dirname, {});
  return {
    status: 'ok',
    answerPage
  };
};
