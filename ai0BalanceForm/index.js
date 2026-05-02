/*
  index.js
  Serves a form for deleting superseded reports.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');

// CONSTANTS

const balancePath = path.join(__dirname, '../ai0Balance.json');

// FUNCTIONS

// Returns a form for recording the AI service 0 balance.
exports.answer = async (_, search) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const newBalanceString = searchParams?.get('newBalance');
  let oldBalance;
  // If the form displayed itself:
  if (newBalanceString) {
    // If the authorization code is valid:
    if (authCode === process.env.AUTH_CODE) {
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
        await fs.writeFile(balancePath, `${JSON.stringify(balanceData, null, 2)}\n`);
        // Make it the old balance.
        oldBalance = `$${balanceData.balance} is the`;
      }
    }
    // Otherwise, i.e. if the authorization code is invalid:
    else {
      // Report the error.
      return {
        status: 'error',
        error: 'Invalid authorization code'
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
    catch (error) {
      oldBalance = 'There is no';
    }
  }
  const query = {oldBalance};
  // Get the order form template.
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
