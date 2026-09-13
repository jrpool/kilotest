/*
  balances.ts
  Manages monetary balances and sends alerts when they near exhaustion.
*/

// IMPORTS

import {sendAlert} from './alerts.ts';
import {errorMessage, getJSON} from './util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {Act, Report} from 'testaro';

// CONSTANTS

// The path of the file recording the AI service 0 balance.
export const balancePath = path.join(import.meta.dirname, 'ai0Balance.json');

// FUNCTIONS

// Checks a report for balances nearing exhaustion.
export const checkBalancesForAlerts = async (report: Report): Promise<void> => {
  // Get the alert thresholds and prices from the environment.
  const WAVE_THRESHOLD = Number(process.env.WAVE_BALANCE_THRESHOLD);
  const AI_SERVICE0_THRESHOLD = Number(process.env.AI_SERVICE0_BALANCE_THRESHOLD);
  const AI_MODEL0_INPUT_PRICE = Number(process.env.AI_MODEL0_INPUT_PRICE);
  const AI_MODEL0_OUTPUT_PRICE = Number(process.env.AI_MODEL0_OUTPUT_PRICE);
  // If the variables to be monitored for alerts are defined:
  if (WAVE_THRESHOLD && AI_SERVICE0_THRESHOLD && AI_MODEL0_INPUT_PRICE && AI_MODEL0_OUTPUT_PRICE) {
    // WAVE.
    const waveAct = report.acts.find((act: Act) => act.type === 'test' && act.which === 'wave');
    const creditsRemaining = waveAct?.data?.creditsRemaining;
    // If a WAVE balance nearing exhaustion is reported:
    if (typeof creditsRemaining === 'number' && creditsRemaining < WAVE_THRESHOLD) {
      // Alert a manager.
      await sendAlert(
        'Kilotest: WAVE balance low',
        `Only ${creditsRemaining} WAVE credits remain (3 used per job)`
      );
    }
    const testaroAct = report.acts.find((act: Act) => act.type === 'test' && act.which === 'testaro');
    // Get the AI model token usage for the testaro allCaps test.
    const usage = (testaroAct?.data?.ruleData as {
      allCaps?: {aiModelUsage?: {inputTokens: number; outputTokens: number}}
    } | undefined)?.allCaps?.aiModelUsage;
    let balanceJSON = null;
    try {
      // Get the recorded AI service 0 balance.
      balanceJSON = await fs.readFile(balancePath, 'utf8');
    }
    catch {
      console.error('ERROR: AI service 0 balance file missing');
    }
    // If the variables required for an AI service 0 balance alert are defined:
    if (usage && AI_MODEL0_INPUT_PRICE && AI_MODEL0_OUTPUT_PRICE && balanceJSON) {
      const inputCost = AI_MODEL0_INPUT_PRICE * usage.inputTokens;
      const outputCost = AI_MODEL0_OUTPUT_PRICE * usage.outputTokens;
      const cost = inputCost + outputCost;
      // If any cost was incurred:
      if (cost > 0) {
        // Warn about this.
        console.log(
          'This job has made the production AI service 0 balance record wrong. Update it.'
        );
      }
      try {
        const balanceData = JSON.parse(balanceJSON);
        // Get an estimate of the balance after this job.
        const newBalance = balanceData.balance - cost;
        // Update the recorded balance.
        await fs.writeFile(balancePath, getJSON({balance: newBalance}));
        console.log(`Estimated new AI Service 0 balance: $${newBalance.toFixed(2)}`);
        // If it is nearing exhaustion:
        if (newBalance < AI_SERVICE0_THRESHOLD) {
          // Alert a manager.
          await sendAlert(
            'Kilotest: AI service 0 balance low',
            `Balance of AI service 0 account (https://console.anthropic.com) only about $${newBalance.toFixed(2)} (about $0.01 used per job)`
          );
        }
      }
      catch (error) {
        console.log(`ERROR managing AI service 0 balance: ${errorMessage(error)}`);
      }
    }
  }
};
