/*
  api.js
  Responds to the report-issue request.
*/

// IMPORTS

const {getData} = require('../reportIssues/util');
const {
  getDateTime,
  getNowStamp,
  getRandomString,
  getReport,
  getToolsFacts,
  isHidden,
  tools
} = require('../util');

// FUNCTIONS

// Temporary function to get issue facts for the UI.
// Adds parameters to a query for the answer page.
const getIssueFactsForAPI = async (issueID, timeStamp, jobID, query) => {
  // Add facts about the issue to the query.
  query.issue = issues[issueID].summary;
  const pageDataStrings = await getPageDataStrings(timeStamp, jobID);
  const {what, url, urlLink, testInfo} = pageDataStrings;
  query.target = what;
  query.urlLink = urlLink;
  query.testInfo = testInfo;
  const issue = issues[issueID];
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = `<a href="${getWCAGLink(wcag)}">${wcag}</a>`;
  // Initialize those whose values depend on instance inspection.
  query.count = 0;
  query.reporters = new Set();
  let violators = {};
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  const {acts, catalog} = report;
  const testActs = acts.filter(act => act.type === 'test');
  // For each test act:
  testActs.forEach(act => {
    const {result, which} = act;
    const issueInstances = result?.standardResult?.instances?.filter(
      instance => instance.issueID === issueID
    ) ?? [];
    // If the rule of any of its standard instances belongs to the issue:
    if (issueInstances.length) {
      query.reporters.add(which);
    }
    // For each standard instance whose rule belongs to the issue:
    issueInstances.forEach(instance => {
      const pathID = instance.pathID || '/html';
      const catalogIndex = instance.catalogIndex || '0';
      const tagName = catalog[catalogIndex]?.tagName
      ?? pathID?.split('/').pop().replace(/\[.+$/, '').toUpperCase()
      ?? 'HTML';
      violators[catalogIndex] ??= {
        pathID: getPathID(catalog, catalogIndex, pathID),
        tagName,
        text: catalog[catalogIndex]?.text ?? '',
        reporters: new Set()
      };
      // Ensure that the tool is in the sets of reporters of the violator and the issue.
      violators[catalogIndex].reporters.add(which);
      query.reporters.add(which);
    });
    // Populate the violator count.
    const violatorCount = Object.keys(violators).length;
    query.violatorCount = violatorCount === 1 ? '1 violator was' : `${violatorCount} violators were`;
  });
  // For each violator:
  Object.values(violators).forEach(violatorData => {
    // Convert the set of its reporters to a string.
    violatorData.reporters = getToolNamesString(violatorData.reporters);
  });
  const reporterCount = query.reporters.size;
  query.reporterCount = reporterCount === 1 ? '1 rule engine' : `${reporterCount} rule engines`;
  // Convert the set of issue reporters to a string.
  query.reporters = getToolNamesString(query.reporters);
  // Convert the violator data to an array.
  violators = Object.entries(violators).map(entry => ({
    catalogIndex: entry[0],
    ... entry[1]
  }));
  // Sort the violators in XPath order.
  violators.sort((a, b) => a.pathID.localeCompare(b.pathID));
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  let takeMeAdviceNeeded = false;
  // For each violator:
  violators.forEach((violator, index) => {
    const {catalogIndex, pathID, reporters, tagName, text} = violator;
    // Add a heading to the lines.
    lines.push(`${margin}<li><h3>Element ${catalogIndex}</h3>`);
    lines.push(`${margin}  <ul class="pseudoTopLevel">`);
    // Add properties of the violator to the lines.
    if (pathID) {
      lines.push(`${margin}    <li>XPath: <code>${makeBreakable(pathID)}</code></li>`);
    }
    if (tagName) {
      lines.push(`${margin}    <li>Tag name: <code>${tagName}</code></li>`);
    }
    if (text && ! ['HTML', 'HEAD', 'BODY', 'MAIN', 'NOSCRIPT'].includes(tagName)) {
      const textString = text.split('\n').join(' … ');
      lines.push(`${margin}    <li>Text: <q>${htmlSafe(textString)}</q></li>`);
    }
    lines.push(`${margin}    <li>Reported by ${reporters}</li>`);
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}  <ul class="nav">`);
    if (catalogIndex) {
      const catalogItem = catalog[catalogIndex] || {};
      if (catalogItem.textLinkable) {
        takeMeAdviceNeeded = true;
        const href = getTextFragmentHref(catalogItem.text, url);
        const label = `Take me to element ${catalogIndex} on the page (in a new tab)`;
        const takeMeLink = `<a href="${href}" target="_blank" aria-label="${label}">Take me there</a>`;
        lines.push(`${margin}    <li>${takeMeLink}</li>`);
      }
    }
    const href
    = `/diagnoses.html/${issueID}/${timeStamp}/${jobID}/${catalogIndex}?pathID=${pathID}`;
    const questionString = 'What diagnoses were reported';
    const labelString = `${questionString} for violator ${index + 1}?`;
    lines.push(
      `${margin}    <li><a href="${href}" aria-label="${labelString}">${questionString}?</a></li>`
    );
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}</li>`);
  });
  // Add the lines to the query.
  query.violators = lines.join('\n');
  query.takeMeThere = '';
  // If any lines contain text-fragment links:
  if (takeMeAdviceNeeded) {
    // Include advice about them in the answer.
    query.takeMeThere = '<p><q>Take me there</q> links will open the page in a new tab and try to scroll to the element and highlight it. This does not always succeed. You can return here by closing the new tab.</p>';
  }
};
// Gets facts about an issue.
const getIssueFacts = async (timeStamp, jobID, issue) => {
  const {issueID, reporterCount, reporters, summary, violatorCount, wcag, why} = issue;
  const wcagType = wcag.length === 3 ? 'guideline' : 'success criterion';
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  const violatorIndexSet = new Set();
  const {acts, catalog} = report;
  // For each act of the report:
  acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result} = act;
      const instances = result?.standardResult?.instances ?? [];
      // For each standard instance of the act:
      instances.forEach(instance => {
        const {catalogIndex} = instance;
        // If its issue is the issue to be described and the instance has a catalog index:
        if (instance.issueID === issueID && catalogIndex) {
          // Ensure that the violator is in the temporary data.
          violatorIndexSet.add(catalogIndex);
        }
      });
    }
  });
  return {
    identifier: issueID,
    summary,
    'related WCAG 2.2 standard': {
      layer: wcagType,
      'numeric identifier': wcag
    },
    'impact on a user': why,
    'rule engines reporting the issue': {
      'number': reporterCount,
      'names': reporters.map(tool => tool.toolName)
    },
    'number of HTML elements reported as exhibiting the issue': violatorCount,
    'HTML elements reported as exhibiting the issue': Array.from(violatorIndexSet).map(index => ({
      identifier: String(index),
      'tag name': catalog[index].tagName,
      'id attribute': catalog[index].id,
      'start tag': catalog[index].startTag,
      'inner text': catalog[index].text,
      'inner text usable as a text fragment for linking': catalog[index].textLinkable,
      'x, y, width, height in pixels': catalog[index].boxID.split(':'),
      'XPath': catalog[index].pathID
    }))
  };
};
// Returns a response to a report-issue request.
exports.response = async args => {
  const [issueID, timeStamp, jobID] = args;
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report is not available:
  if (reportIsHidden) {
    return {
      status: 'error',
      message: 'Report not available'
    };
  }
  // Otherwise, i.e. if the report is available, get data on the target and issues.
  const data = await getData(timeStamp, jobID);
  const {pageData, issuesData} = data;
  const {what, url, daysAgo} = pageData;
  const {issueCount, issues, preventions, reporterCount, reporters, violatorCount} = issuesData;
  let issue;
  const issueLevel = [4, 3, 2, 1].find(level => {
    issue = issues[level].find(issue => issue.issueID === issueID);
    return issue;
  });
  if (! issue) {
    return {
      status: 'error',
      message: 'Issue not found in the report'
    };
  }
  const preventedTools = Object.entries(preventions).map(prevention => ({
    name: tools[prevention[0]][0],
    'reason for failure': prevention[1]
  }));
  const thisHost = process.env.THIS_KILOTEST_HOST;
  // Get a response.
  const content = {
    summary: `This document fulfills a request made by a language model to a Kilotest tool. The model requested data from a Kilotest report about one of the issues for the front-end quality (i.e. accessibility, usability, and standard-conformity) of a web page. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes several API endpoints to recommend web pages for testing and to obtain information from Kilotest reports. To learn more about Kilotest and the advangages of testing with an ensemble of rule engines, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool collection name': 'Kilotest',
    'tool name': 'describeOneIssueForQualityOfOneWebPage',
    request: {
      'type of request': {
        identifier: 'reportIssue',
        description: 'Describe one issue for the quality of one web page.'
      },
      method: 'GET',
      URLs: {
        'URL of your request': `${thisHost}/api/reportIssue/${issueID}/${timeStamp}/${jobID}`,
        'equivalent URL for humans': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        identifier: 'describeQualityOfOneWebPage',
        description: 'Describe the quality of one web page.',
        URLs: {
          'for you': `${thisHost}/api/reportIssues`,
          'for humans': `${thisHost}/reportIssues.html`
        }
      }
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString()
    },
    report: {
      identifier: `${timeStamp}-${jobID}`,
      'creation date': getDateTime(timeStamp),
      'days since the creation date': daysAgo
    },
    'tested web page': {
      description: what,
      URL: url
    },
    'rule engines that tried to test the page': getToolsFacts(Object.keys(tools)),
    'rule engines that were unable to test the page': preventedTools,
    'rule engines that reported issues': {
      number: reporterCount,
      names: reporters.map(tool => tool.toolName)
    },
    'number of issues reported': {
      total: issueCount,
      'by priority': {
        'highest priority': issues[4].length,
        'high priority': issues[3].length,
        'low priority': issues[2].length,
        'lowest priority': issues[1].length
      }
    },
    "issue to be described": issueID,
    'number of HTML elements reported as exhibiting issues': violatorCount,
    'issues reported': {
      'highest priority': issues[4]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue)),
      'high priority': issues[3]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue)),
      'low priority': issues[2]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue)),
      'lowest priority': issues[1]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue))
    }
  };
  return content;
};
