/*
  util.js
  Utility functions.
*/

// IMPORTS

// Module to access files.
const fs = require('fs/promises');

// FUNCTIONS

// Gets the data from a POST request.
exports.getPostData = async request => {
  return new Promise((resolve, reject) => {
    const bodyParts = [];
    request.on('error', async err => {
      reject(err);
    })
    .on('data', chunk => {
      bodyParts.push(chunk);
    })
    // When the request has arrived:
    .on('end', async () => {
      try {
        // Get a query string from the request body.
        const queryString = Buffer.concat(bodyParts).toString();
        // Parse it as an array of key-value pairs.
        const requestParams = new URLSearchParams(queryString);
        // Convert it to an object with string-valued properties.
        const postData = {};
        requestParams.forEach((value, name) => {
          postData[name] = value;
        });
        resolve(postData);
      }
      catch (err) {
        reject(err);
      }
    });
  });
};
// Serves an error message.
exports.serveError = async (error, response) => {
  console.log(error.message);
  if (! response.writableEnded) {
    response.statusCode = 400;
    const errorTemplate = await fs.readFile('error.html', 'utf8');
    const errorPage = errorTemplate.replace(/__error__/, error.message);
    response.end(errorPage);
  }
};
// Digests a scored report and returns it, digested.
exports.digest = async (digester, report, query = {}) => {
  // Create a digest.
  const digest = await digester(report, query);
  console.log(`Report ${report.id} digested`);
  // Return the digest.
  return digest;
};
