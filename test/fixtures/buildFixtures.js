/*
  buildFixtures.js
  Builds the fixture corpus for Kilotest tests.

  Each fixture is a minimal Testaro report in the current format, crafted so that the expected API response can be hand-computed and hard-coded into tests. The fixtures collectively cover the `outcome` property values (`failed`, `cantTell`, and missing/undefined), superseded reports, empty reports, and prevented rule engines.

  Run with: node test/fixtures/buildFixtures.js [targetDir]
  Defaults to test/fixtures/db under the project root.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');

// CONSTANTS

// Issue IDs with known specs in testaro-issues, chosen for different weights.
const ISSUE_LINK_NO_TEXT = 'linkNoText';       // weight 4 (highest)
const ISSUE_FOCUS_INDICATION = 'focusIndicationBad'; // weight 4
const ISSUE_ALL_CAPS = 'allCaps';              // weight 1 (lowest)

// Rule engine IDs that exist in util.js ruleEngines.
const ENGINE_AXE = 'axe';
const ENGINE_ALFA = 'alfa';
const ENGINE_IBM = 'ibm';

// FUNCTIONS

// Returns a minimal catalog item.
const catalogItem = (tagName, text, pathID = '/html', boxID = '0:0:100:50') => ({
  tagName,
  id: '',
  startTag: `<${tagName.toLowerCase()}>`,
  text,
  textLinkable: false,
  boxID,
  pathID,
  headingIndex: '',
  checkpoint: 0
});

// Returns a minimal standard instance.
const instance = (
  ruleID, what, outcome, issueID, catalogIndex, ordinalSeverity = 2, count = 1
) => ({
  ruleID,
  what,
  ordinalSeverity,
  outcome,
  count,
  catalogIndex: String(catalogIndex),
  checkpoint: 0,
  issueID
});

// Returns a minimal test act.
const testAct = (which, instances) => ({
  type: 'test',
  which,
  startTime: '26-01-01T00:00',
  endTime: '26-01-01T00:01',
  result: {
    standardResult: {
      instances,
      outcomeTotals: {
        failed: instances.filter(i => i.outcome === 'failed').length,
        cantTell: instances.filter(i => i.outcome === 'cantTell').length
      }
    }
  }
});

// Returns a minimal valid report.
const report = (id, what, url, acts, catalog, endTime = '26-01-01T00:10') => ({
  id,
  what,
  strict: false,
  standard: 'only',
  device: {id: 'default'},
  browserID: 'chromium',
  creationTimeStamp: id.slice(0, 11),
  executionTimeStamp: id.slice(0, 11),
  target: {what, url},
  sources: {worker: 'test-worker'},
  acts,
  jobData: {
    startTime: '26-01-01T00:00',
    endTime,
    elapsedSeconds: 600,
    preventions: {},
    issuelessRules: []
  },
  catalog,
  images: {},
  checkpoints: []
});

// Writes a JSON file with a trailing newline.
const writeJSON = async (filePath, object) => {
  await fs.writeFile(filePath, `${JSON.stringify(object, null, 2)}\n`);
};

// MAIN

const main = async () => {
  const targetDir = process.argv[2] || path.join(__dirname, 'db');
  const reportsDir = path.join(targetDir, 'reports');
  await fs.mkdir(reportsDir, {recursive: true});
  await fs.mkdir(path.join(targetDir, 'jobs', 'queue'), {recursive: true});
  await fs.mkdir(path.join(targetDir, 'jobs', 'claimed'), {recursive: true});
  await fs.mkdir(path.join(targetDir, 'jobs', 'failed'), {recursive: true});
  await fs.mkdir(path.join(targetDir, 'hiddenReports'), {recursive: true});

  // Fixture 1: mixedOutcomes. Two rule engines, four instances: two failed (same issue, same violator, two engines), one cantTell (excluded from counts), one failed (different issue, different violator). Two distinct issues (linkNoText weight 4, allCaps weight 1) and two distinct violator catalog indexes (0 and 1).
  const mixedCatalog = {
    '0': catalogItem('A', 'About Us', '/html/body/a[1]', '10:20:80:30'),
    '1': catalogItem('P', 'ALL ABOUT US', '/html/body/p[1]', '10:60:80:20')
  };
  const mixedActs = [
    testAct(ENGINE_AXE, [
      instance('r11', 'The link does not have an accessible name', 'failed',
        ISSUE_LINK_NO_TEXT, 0, 2, 1),
      instance('r65', 'Focus Visible', 'cantTell',
        ISSUE_FOCUS_INDICATION, 0, 0, 1)
    ]),
    testAct(ENGINE_ALFA, [
      instance('r11', 'The link does not have an accessible name', 'failed',
        ISSUE_LINK_NO_TEXT, 0, 2, 1),
      instance('r3', 'Text is all-capital', 'failed',
        ISSUE_ALL_CAPS, 1, 1, 1)
    ])
  ];
  await writeJSON(
    path.join(reportsDir, '260101T0000-mix.json'),
    report('260101T0000-mix', 'Mixed Outcomes Page',
      'https://example.com/mixed', mixedActs, mixedCatalog)
  );

  // Fixture 2: allCantTell. All instances have outcome cantTell, so no issues or violators should be reported by listIssues, listViolators, or listDiagnoses.
  const cantTellCatalog = {
    '0': catalogItem('A', 'Click here', '/html/body/a[1]', '5:10:60:20')
  };
  const cantTellActs = [
    testAct(ENGINE_AXE, [
      instance('r65', 'Focus Visible', 'cantTell',
        ISSUE_FOCUS_INDICATION, 0, 0, 1)
    ])
  ];
  await writeJSON(
    path.join(reportsDir, '260101T0001-ct.json'),
    report('260101T0001-ct', 'All CantTell Page',
      'https://example.com/canttell', cantTellActs, cantTellCatalog)
  );

  // Fixture 3: noOutcomes. Instances with no outcome property. Testaro defaults to 'failed', but Kilotest code checks `outcome !== 'cantTell'`, so missing outcome (undefined) is treated as a violation. This verifies that behavior.
  const noOutcomeCatalog = {
    '0': catalogItem('BUTTON', 'Submit', '/html/body/button[1]', '15:25:70:30')
  };
  const noOutcomeActs = [
    testAct(ENGINE_IBM, [
      {
        ruleID: 'r1',
        what: 'Button has no accessible name',
        ordinalSeverity: 3,
        count: 1,
        catalogIndex: '0',
        checkpoint: 0,
        issueID: ISSUE_LINK_NO_TEXT
      }
    ])
  ];
  await writeJSON(
    path.join(reportsDir, '260101T0002-no.json'),
    report('260101T0002-no', 'No Outcomes Page',
      'https://example.com/nooutcomes', noOutcomeActs, noOutcomeCatalog)
  );

  // Fixture 4: superseded. A report about the same page as mixedOutcomes but with a later timestamp, so mixedOutcomes is superseded by this one.
  const newerActs = [
    testAct(ENGINE_AXE, [
      instance('r11', 'The link does not have an accessible name', 'failed',
        ISSUE_LINK_NO_TEXT, 0, 2, 1)
    ])
  ];
  await writeJSON(
    path.join(reportsDir, '260202T0000-new.json'),
    report('260202T0000-new', 'Mixed Outcomes Page',
      'https://example.com/mixed', newerActs, mixedCatalog, '26-02-02T00:10')
  );

  // Fixture 5: empty. A valid report with no test acts that have instances, so listIssues returns zero issues.
  await writeJSON(
    path.join(reportsDir, '260101T0005-emp.json'),
    report('260101T0005-emp', 'Empty Results Page',
      'https://example.com/empty', [testAct(ENGINE_AXE, [])], {})
  );

  // Fixture 6: prevented. A report where one rule engine was prevented from testing.
  const preventedCatalog = {
    '0': catalogItem('IMG', 'An image', '/html/body/img[1]', '0:0:200:100')
  };
  const preventedActs = [
    testAct(ENGINE_AXE, [
      instance('r11', 'The image has no alt text', 'failed',
        ISSUE_LINK_NO_TEXT, 0, 2, 1)
    ])
  ];
  const preventedReport = report('260101T0006-prv', 'Prevented Page',
    'https://example.com/prevented', preventedActs, preventedCatalog);
  preventedReport.jobData.preventions = {alfa: 'page timed out'};
  await writeJSON(
    path.join(reportsDir, '260101T0006-prv.json'),
    preventedReport
  );

  // Write an empty recs.json so getRecs does not try to create one.
  await writeJSON(path.join(targetDir, 'jobs', 'recs.json'), {});

  console.log(`Fixtures built in ${targetDir}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
