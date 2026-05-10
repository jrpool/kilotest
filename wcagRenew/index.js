/*
  index.js
  Renews the WCAG map and serves an acknowledgment.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Renews the WCAG map and serves an acknowledgment.
exports.answer = async authCode => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // Get the map source response.
    const mapSourceResponse = await fetch('https://www.w3.org/WAI/WCAG22/Understanding/');
    const mapSourceStatus = mapSourceResponse.status;
    // If the acquisition succeeded:
    if (mapSourceStatus === 200) {
      // Get the HTML of the map source page.
      const mapSourceHTML = await mapSourceResponse.text();
      // Get the map entries.
      const mapEntries = mapSourceHTML
      match(/<a href="([^"]+)>.+<span class="secno">([\d.]+) *<\/span>/gs);
      // Initialize the WCAG map.
      const wcagMap = {};
      // For each entry:
      mapEntries.forEach(entry => {
        // Add it to the map.
        wcagMap[entry[2]] = entry[1];
      });
      // Save the map, replacing any existing one.
      await fs.writeFile(
        path.join(__dirname, '..', 'wcagMap.json'), `${JSON.stringify(wcagMap, null, 2)}\n`
      );
      // Get the acknowledgment page.
      const answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
      // Return it.
      return {
        status: 'ok',
        answerPage
      };
    }
    else {
      return {
        status: 'error',
        error: 'WCAG map source not retrieved'
      };
    }
  }
  else {
    return {
      status: 'error',
      error: 'Authorization code invalid'
    };
  }
};
