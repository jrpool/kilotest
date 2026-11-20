/*
  classification.test.ts
  Tests for the rule-classification, annotation, and violation-data functions of util.ts, using a mocked rule classification, so that their results do not depend on the classification in the testaro-issues dependency.
*/

// IMPORTS

import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {mockClassification} from './test/fixtures/classification.ts';

// Blank the alert configuration before util.ts is imported, so this file sends no real alert emails even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

// Mock the rule classification before importing util.ts, so that util.ts imports the mocked version.
mockClassification();

const {
  annotateReportObject,
  getIssue,
  getReportExtracts,
  getRuleClass,
  getRuleKeyIssue,
  getRuleKeySpec,
  getViolationData,
  reannotationNeededMessage
} = await import('./util.ts');

// TESTS

test('getRuleClass returns the rule key and issue of an invariant rule', () => {
  assert.deepEqual(getRuleClass('axe', 'mockRule'), {ruleKey: 'mockRule', issueID: 'mockIssueA'});
});

test('getRuleClass returns the pattern of a matching variable rule as its rule key', () => {
  assert.deepEqual(
    getRuleClass('nuVal', 'Mock message about foo.'),
    {ruleKey: 'Mock message about .+\\.', issueID: 'mockIssueB'}
  );
});

test('getRuleClass returns null for an unclassified rule or an unknown engine', () => {
  assert.equal(getRuleClass('axe', 'nonexistent-rule-id'), null);
  assert.equal(getRuleClass('nonexistentEngine', 'mockRule'), null);
});

test('getIssue returns the issue of a classified rule', () => {
  assert.equal(getIssue('axe', 'mockRule'), 'mockIssueA');
  assert.equal(getIssue('nuVal', 'Mock message about foo.'), 'mockIssueB');
});

test('getIssue returns null for an unclassified rule', () => {
  assert.equal(getIssue('axe', 'nonexistent-rule-id'), null);
});

test('getRuleKeyIssue returns the issue of an invariant or variable rule key', () => {
  assert.equal(getRuleKeyIssue('axe', 'mockRule'), 'mockIssueA');
  assert.equal(getRuleKeyIssue('nuVal', 'Mock message about .+\\.'), 'mockIssueB');
});

test('getRuleKeySpec returns the description and issue of a rule key, or null for an unknown one', () => {
  assert.deepEqual(getRuleKeySpec('axe', 'mockRule'), {what: 'Mock rule', issueID: 'mockIssueA'});
  assert.deepEqual(getRuleKeySpec('nuVal', 'Mock message about .+\\.'), {what: 'Mock message', issueID: 'mockIssueB'});
  assert.equal(getRuleKeySpec('axe', 'nonexistent-rule-id'), null);
});

test('getRuleKeyIssue returns null for an unknown rule key or engine', () => {
  // A rule ID that a variable rule matches is not itself a rule key.
  assert.equal(getRuleKeyIssue('nuVal', 'Mock message about foo.'), null);
  assert.equal(getRuleKeyIssue('nonexistentEngine', 'mockRule'), null);
});

test('annotateReportObject annotates a report object in place without reading or writing a file', async () => {
  // A report object that was never written to disk (e.g. one just received from a worker,
  // as in index.ts's worker/report handler, which annotates before the first write).
  const report: any = {
    id: '990101T0099-obj',
    target: {what: 'Object Page', url: 'https://example.com/object'},
    acts: [
      {
        type: 'test',
        which: 'axe',
        result: {
          standardResult: {
            instances: [
              // A classifiable rule.
              {ruleID: 'mockRule', what: 'Mock rule', outcome: 'failed', catalogIndex: '0'},
              // An unclassifiable rule, with an annotation to be removed.
              {ruleID: 'unknownRule123', what: 'Unknown', outcome: 'failed', catalogIndex: '0', issueID: 'mockIssueB'}
            ]
          }
        }
      }
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  await annotateReportObject(report);
  const instances = report.acts[0].result.standardResult.instances;
  assert.equal(instances[0].issueID, 'mockIssueA');
  assert.equal(instances[1].issueID, undefined);
  assert.deepEqual(report.jobData.issuelessRules, ['axe:unknownRule123']);
});

test('annotateReportObject handles a test act with no standardResult instances', async () => {
  const report: any = {
    id: '990101T0098-ni',
    target: {what: 'Test', url: 'https://example.com'},
    acts: [
      {type: 'test', which: 'axe', result: {standardResult: {instances: []}}},
      {type: 'other'}
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  await annotateReportObject(report);
  assert.deepEqual(report.jobData.issuelessRules, []);
});

test('annotateReportObject handles a test act with no standardResult', async () => {
  const report: any = {
    id: '990101T0097-ns',
    target: {what: 'Test', url: 'https://example.com'},
    acts: [
      {type: 'test', which: 'axe', result: {}}
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  await annotateReportObject(report);
  assert.deepEqual(report.jobData.issuelessRules, []);
});

// Returns a minimal standard instance for violation-data tests.
const violationInstance = (
  ruleID: string, issueID: string | undefined, catalogIndex?: string | number, outcome?: string, count?: number
) => ({ruleID, what: ruleID, ordinalSeverity: 2, outcome, count, catalogIndex, issueID});
// Returns a minimal usable report for violation-data tests.
const violationReport = (
  pageID: string, endTime: string, acts: Record<string, any[]>, preventions: Record<string, string> = {}
) => ({
  target: {what: `Page ${pageID}`, url: `https://example.com/${pageID}`},
  sources: {pageID},
  acts: Object.entries(acts).map(([which, instances]) => ({
    type: 'test', which, result: {standardResult: {instances}}
  })),
  jobData: {endTime, preventions},
  catalog: {}
});
// Runs a function with the data directory pointed at an empty temporary one, passing it the path of its reports directory.
const withTmpReports = async (run: (reportsDir: string) => Promise<void>) => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-violations-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    await fs.mkdir(tmpReportsDir, {recursive: true});
    await run(tmpReportsDir);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    await fs.rm(tmpRoot, {recursive: true}).catch(() => {});
  }
};
// Returns the number of reannotation alerts logged while a function runs. The alert configuration is blank in tests, so sendAlert logs each alert instead of sending it.
const countReannotationAlerts = async (run: () => Promise<void>): Promise<number> => {
  const logMock = mock.method(console, 'log', () => {});
  try {
    await run();
    return logMock.mock.calls.filter(
      call => String(call.arguments[0]).includes('Kilotest: reannotation needed')
    ).length;
  }
  finally {
    logMock.mock.restore();
  }
};

test('getViolationData collects violators, counts, and unlocated counts by engine, rule key, and outcome', async () => {
  await withTmpReports(async reportsDir => {
    const report = violationReport('p-aaaaaaaa', '26-01-01T00:10', {
      axe: [
        violationInstance('mockRule', 'mockIssueA', '0', 'failed', 1),
        violationInstance('mockRule', 'mockIssueA', 2, undefined, 3),
        violationInstance('mockRule', 'mockIssueA', undefined, 'failed', 2),
        violationInstance('mockRule', 'mockIssueA', '1', 'cantTell')
      ],
      nuVal: [
        violationInstance('Mock message about foo.', 'mockIssueB', '0', 'failed'),
        violationInstance('Mock message about bar.', 'mockIssueB', '1', 'failed')
      ],
      alfa: []
    }, {ibm: 'page timed out'});
    await fs.writeFile(path.join(reportsDir, '260101T0000-aaa.json'), JSON.stringify(report));
    const data = await getViolationData();
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 1);
    const {extract, violations} = data[0]!;
    assert.equal(extract.id, '260101T0000-aaa');
    assert.deepEqual(extract.ruleEngineIDs, ['alfa', 'axe', 'nuVal']);
    assert.deepEqual(extract.preventions, {ibm: 'page timed out'});
    assert.deepEqual(extract.rulePreventions, {});
    assert.deepEqual(violations, {
      axe: {
        'mockRule': {
          failed: {violators: new Set(['0', '2']), count: 6, unlocatedCount: 2},
          cantTell: {violators: new Set(['1']), count: 1, unlocatedCount: 0}
        }
      },
      nuVal: {
        'Mock message about .+\\.': {
          failed: {violators: new Set(['0', '1']), count: 2, unlocatedCount: 0},
          cantTell: {violators: new Set(), count: 0, unlocatedCount: 0}
        }
      }
    });
  });
});

test('getViolationData includes only the latest report about each page', async () => {
  await withTmpReports(async reportsDir => {
    const instances = {axe: [violationInstance('mockRule', 'mockIssueA', '0', 'failed')]};
    await fs.writeFile(
      path.join(reportsDir, '260101T0000-old.json'),
      JSON.stringify(violationReport('p-aaaaaaaa', '26-01-01T00:10', instances))
    );
    await fs.writeFile(
      path.join(reportsDir, '260201T0000-new.json'),
      JSON.stringify(violationReport('p-aaaaaaaa', '26-02-01T00:10', instances))
    );
    await fs.writeFile(
      path.join(reportsDir, '260101T0000-oth.json'),
      JSON.stringify(violationReport('p-bbbbbbbb', '26-01-01T00:10', instances))
    );
    const data = await getViolationData();
    assert.ok(Array.isArray(data));
    assert.deepEqual(data.map(({extract}) => extract.id).sort(), ['260101T0000-oth', '260201T0000-new']);
  });
});

test('getViolationData returns an error and alerts once for each kind of instance needing reannotation', async () => {
  const cases: Record<string, any> = {
    'an obsolete issue': violationInstance('mockRule', 'noSuchIssue', '0', 'failed'),
    'a reclassified rule': violationInstance('mockRule', 'mockIssueB', '0', 'failed'),
    'a newly classified rule': violationInstance('mockRule', undefined, '0', 'failed'),
    'an unclassified rule': violationInstance('nonexistent-rule-id', undefined, '0', 'failed'),
    'an out-of-date cantTell instance': violationInstance('mockRule', 'mockIssueB', '0', 'cantTell')
  };
  for (const [description, instance] of Object.entries(cases)) {
    await withTmpReports(async reportsDir => {
      const report = violationReport('p-aaaaaaaa', '26-01-01T00:10', {
        axe: [violationInstance('mockOtherRule', 'mockIssueB', '1', 'failed'), instance]
      });
      await fs.writeFile(path.join(reportsDir, '260101T0000-aaa.json'), JSON.stringify(report));
      let data: any;
      const alertCount = await countReannotationAlerts(async () => {
        data = await getViolationData();
      });
      assert.deepEqual(data, {error: reannotationNeededMessage}, description);
      assert.equal(alertCount, 1, description);
    });
  }
});

test('getViolationData sends no alert when no report needs reannotation', async () => {
  await withTmpReports(async reportsDir => {
    const report = violationReport('p-aaaaaaaa', '26-01-01T00:10', {
      axe: [violationInstance('mockRule', 'mockIssueA', '0', 'failed')]
    });
    await fs.writeFile(path.join(reportsDir, '260101T0000-aaa.json'), JSON.stringify(report));
    const alertCount = await countReannotationAlerts(async () => {
      assert.ok(Array.isArray(await getViolationData()));
    });
    assert.equal(alertCount, 0);
  });
});

test('getViolationData reuses cached data while a report file is unchanged and reflects changes', async () => {
  await withTmpReports(async reportsDir => {
    const firstPath = path.join(reportsDir, '260101T0000-aaa.json');
    const report = violationReport('p-aaaaaaaa', '26-01-01T00:10', {
      axe: [violationInstance('mockRule', 'mockIssueA', '0', 'failed')]
    });
    await fs.writeFile(firstPath, JSON.stringify(report));
    // Give the file a whole-second modification time, so that it can be restored exactly.
    const earlier = new Date('2026-01-01T00:00:00Z');
    await fs.utimes(firstPath, earlier, earlier);
    let data = await getViolationData() as any[];
    assert.deepEqual(data[0].violations.axe.mockRule.failed.violators, new Set(['0']));
    // Rewrite the file with content of the same size and restore its modification time, so its cached data are still treated as current.
    report.acts[0]!.result.standardResult.instances[0]!.catalogIndex = '5';
    await fs.writeFile(firstPath, JSON.stringify(report));
    await fs.utimes(firstPath, earlier, earlier);
    data = await getViolationData() as any[];
    assert.deepEqual(data[0].violations.axe.mockRule.failed.violators, new Set(['0']));
    // Give the file a later modification time, as reannotation would.
    const later = new Date(Date.now() + 60000);
    await fs.utimes(firstPath, later, later);
    data = await getViolationData() as any[];
    assert.deepEqual(data[0].violations.axe.mockRule.failed.violators, new Set(['5']));
    // Add a report about another page.
    const secondPath = path.join(reportsDir, '260101T0000-bbb.json');
    await fs.writeFile(secondPath, JSON.stringify({...report, sources: {pageID: 'p-bbbbbbbb'}}));
    data = await getViolationData() as any[];
    assert.deepEqual(data.map(({extract}) => extract.id).sort(), ['260101T0000-aaa', '260101T0000-bbb']);
    // Remove a report, as hiding would.
    await fs.rm(firstPath);
    data = await getViolationData() as any[];
    assert.deepEqual(data.map(({extract}) => extract.id), ['260101T0000-bbb']);
  });
});

test('getViolationData returns an error when a latest report cannot be read', {
  // A superuser can read a file whatever its permissions.
  skip: process.getuid?.() === 0
}, async () => {
  await withTmpReports(async reportsDir => {
    const reportPath = path.join(reportsDir, '260101T0000-aaa.json');
    const report = violationReport('p-aaaaaaaa', '26-01-01T00:10', {
      axe: [violationInstance('mockRule', 'mockIssueA', '0', 'failed')]
    });
    await fs.writeFile(reportPath, JSON.stringify(report));
    // Cache the extract of the report, which a permission change does not invalidate.
    await getReportExtracts(true);
    await fs.chmod(reportPath, 0o000);
    try {
      const data: any = await getViolationData();
      assert.ok(data.error);
    }
    finally {
      await fs.chmod(reportPath, 0o644);
    }
  });
});
