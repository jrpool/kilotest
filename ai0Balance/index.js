/*
  index.js
  Displays the last recorded and records a new AI service 0 balance.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');
const {getJSON} = require('../util');
const {balance} = require('../ai0Balance.json');

// CONSTANTS

const balancePath = path.join(__dirname, '../ai0Balance.json');

// FUNCTIONS

// Displays the last recorded and records a new AI service 0 balance.
exports.answer = async (newBalance, authCode) => {
  const query = {
    balance,
    action: 'No new balance has been recorded.'
  };
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // If a new balance was specified:
    if (newBalance) {
      // Convert it to a number.
      newBalance = Number.parseFloat(newBalance);
      // If it is valid:
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
        // Report this.
        query.action = `The new balance of $${newBalance.toFixed(2)} has been recorded.`;
      }
      // Otherwise, i.e. if it is invalid:
      else {
        // Report this.
        query.action = `ERROR: The new balance of $${newBalance} that you entered is invalid.`;
      }
    }
    // Get the answer-page template.
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
  }
  // Otherwise, i.e. if the authorization code is invalid:
  else {
    // Report the error.
    return {
      status: 'error',
      error: 'Invalid authorization code'
    }
  }
};
