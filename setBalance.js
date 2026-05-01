/*
  setBalance.js
  CLI to initialize or reset the AI service 0 running-balance file after a top-up.
  Usage: node setBalance.js <dollars>
*/

const fs = require('fs/promises');
const path = require('path');

const amount = Number(process.argv[2]);
if (isNaN(amount) || amount < 0) {
  console.error('Usage: node setBalance.js <dollars>');
  process.exit(1);
}
const balancePath = path.join(__dirname, 'aiService0Balance.json');
fs.writeFile(balancePath, `${JSON.stringify({balance: amount}, null, 2)}\n`)
.then(() => console.log(`AI service 0 balance set to $${amount}`))
.catch(error => {
  console.error(error.message);
  process.exit(1);
});
