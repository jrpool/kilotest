/*
  api.js
  Responds to the test-recommendation request.
*/

// IMPORTS

const {sendAlert} = require('../alerts')
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
  // Alert a manager about it.
  await sendAlert(
    `Kilotest: new test recommendation in the API`,
    `Target: ${what}\nURL: ${url}\nReason: ${why}`
  );
  // Get a response.
  const content = {
    summary: `This response acknowledges a request made by a language model to a Kilotest tool. The model recommended that Kilotest test, for the first time, the ${what} web page at ${url} for front-end quality (i.e. accessibility, usability, and standards conformity). A Kilotest manager usually approves a recommendation within a day. When the recommendation is approved, the testing will be performed and results will become available. You can check for the availability of the results at ${thisHost}/api/reportList. Kilotest performs its testing with the help of Testaro, Testilo, and an ensemble of ten rule engines, using a combination of rule- and machine-learning-based methods. Kilotest exposes several API endpoints and several web UI URLs to obtain information from Kilotest reports. To learn more about Kilotest and the advantages of testing with an ensemble of rule engines, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool collection name': 'Kilotest',
    'tool name': 'recommendQualityTestingOfOneWebPage',
    request: {
      'type of request': {
        identifier: 'testRecForm',
        description: 'Recommend quality testing of one web page.'
      },
      method: 'POST',
      payload: {
        'description of the web page': what,
        'URL of the web page': url,
        'reason for testing the web page': why
      },
      URLs: {
        'for you': `${thisHost}/api/testRecForm`,
        'for humans': `${thisHost}/testRecForm.html`
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
