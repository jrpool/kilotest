/*
  api.js
  Responds to the test-recommendation request.
*/

// IMPORTS

const {
  getNowStamp,
  getRandomString,
  updateRecs
} = require('../util');

// FUNCTIONS

// Returns a response to a test-recommendation request.
exports.response = async (what, url, why) => {
  const thisHost = process.env.THIS_KILOTEST_HOST;
  // Record the recommendation.
  await updateRecs(what, url, why);
  // Get a response.
  const content = {
    summary: `This response acknowledges a request made by an agent to the Kilotest service. The agent recommended that Kilotest test the ${what} web page at ${url} for accessibility, usability, and standard-conformity. A Kilotest manager usually approves a recommendation within a day. When the recommendation is approved, the testing will be performed and results will become available. You can check for the availability of the results at ${thisHost}/api/targets. Kilotest performs its testing with the help of Testaro, Testilo, and an ensemble of ten testing tools, using a combination of rule- and machine-learning-based methods. Kilotest exposes several API endpoints for agents and several web UI URLs for humans to obtain information from Kilotest reports. To learn more about Kilotest and the advangages of testing with an ensemble of tools, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool name': 'Kilotest',
    request: {
      'type of request': {
        identifier: 'testRecForm',
        description: 'I recommend that Kilotest test a particular web page.'
      },
      method: 'POST',
      payload: {
        'description of the web page': what,
        'URL of the web page': url,
        'reason for testing the web page': why
      },
      URLs: {
        'URL of your request': `${thisHost}/api/testRecForm`,
        'equivalent URL for humans': `${thisHost}/testRecForm.html`
      },
      'closest ancestor request': null
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString()
    }
  };
  return content;
};
