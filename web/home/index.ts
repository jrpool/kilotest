/*
  index.ts
  Serves the home page.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';
import {getLogo} from '../util.ts';

// FUNCTIONS

// Returns the home page.
export const answer = async () => {
  const answerPage = await populateTemplate(import.meta.dirname, {logo: await getLogo()});
  return {
    status: 'ok',
    answerPage
  };
};
