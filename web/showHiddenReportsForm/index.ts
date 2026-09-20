/*
  index.ts
  Serves a form requesting an authorization code, and, once a valid code is submitted,
  serves unhideReportForm's own list of hidden reports and its self-submitting unhide
  form, so that the names of hidden reports are never disclosed without a valid code.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';
import {answer as unhideReportForm} from '../unhideReportForm/index.ts';

// FUNCTIONS

// Returns a form requesting an authorization code on a GET request or an invalid
// submission, or, on a POST request with a valid code, unhideReportForm's own page
// (the list of hidden reports and its unhide form). A GET request, regardless of its
// query string, never processes a submission, so the code cannot be validated by GET.
export const answer = async (pathTail: any, search: string, method: string) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  // If the form has been submitted:
  if (method === 'POST') {
    // If the authorization code is invalid:
    if (authCode !== process.env.AUTH_CODE) {
      // Report the error.
      return {
        status: 'error',
        message: 'Invalid authorization code'
      };
    }
    // Otherwise, i.e. if the authorization code is valid, serve unhideReportForm's own
    // page (the list of hidden reports and its self-submitting unhide form).
    return unhideReportForm(pathTail, search, 'GET');
  }
  // Otherwise, i.e. if the form has not been submitted yet, get the populated template.
  const answerPage = await populateTemplate(import.meta.dirname, {});
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
