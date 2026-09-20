/*
  index.ts
  Serves a form for recording the AI service 0 balance.
*/

// IMPORTS

import fs from 'node:fs/promises';
import {balancePath} from '../../balances.ts';
import {getJSON, isValidAuthCode, populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns a form for recording the AI service 0 balance. A GET request never processes a
// submission, regardless of its query string; only a POST request (the form's own
// submission) does.
export const answer = async (_: any, search: string, method: string) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const newBalanceString = searchParams?.get('newBalance');
  let oldBalance: any;
  // If the form has been submitted:
  if (method === 'POST' && newBalanceString) {
    // If the authorization code is valid:
    if (isValidAuthCode(authCode)) {
      const newBalance = Number.parseFloat(newBalanceString);
      // If the new balance is valid:
      if (
        typeof newBalance === 'number'
        && newBalance >= 0
        && newBalance < 100
        && Number.isInteger(100 * newBalance)
      ) {
        const balanceData = {
          balance: newBalance
        }
        // Record it.
        await fs.writeFile(balancePath, getJSON(balanceData));
        // Make it the old balance.
        oldBalance = `$${balanceData.balance} is the`;
      }
    }
    // Otherwise, i.e. if the authorization code is invalid:
    else {
      // Report the error, deliberately vague so as not to confirm to an attacker that the
      // authorization code specifically (as opposed to some other part of the request) is
      // what was wrong.
      return {
        status: 'error',
        message: 'Invalid request'
      }
    }
  }
  // Otherwise, i.e. if the form has not been displayed by itself:
  else {
    // Get the current balance from the balance file.
    try {
      const balanceDataJSON = await fs.readFile(balancePath, 'utf8');
      const balanceData = JSON.parse(balanceDataJSON);
      oldBalance = `$${balanceData.balance} is the`;
    }
    // If the balance file does not exist or is invalid:
    catch {
      oldBalance = 'There is no';
    }
  }
  const query: Record<string, any> = {oldBalance};
  // Get the populated order form template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
