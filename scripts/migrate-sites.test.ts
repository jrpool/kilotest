/*
  migrate-sites.test.ts
  Tests for scripts/migrate-sites.ts.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyPlan, getMappingEntries, getPlan, getRegistrySync, getReportFiles} from './migrate-sites.ts';
import type {MappingEntry} from './migrate-sites.ts';
import {registryPath} from '../registry.ts';
import type {Registry} from '../registry.ts';

// FUNCTIONS

// Creates a temporary data directory with reports and hidden reports, runs a function with DB_DIR pointing to it, and removes it.
const withDB = (
  reports: Record<string, object>, hiddenReports: Record<string, object>, run: (dbDir: string) => void
): void => {
  const savedDBDir = process.env.DB_DIR;
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilotest-migrate-'));
  try {
    for (const [dirName, files] of [['reports', reports], ['hiddenReports', hiddenReports]] as const) {
      fs.mkdirSync(path.join(dbDir, dirName));
      for (const [id, report] of Object.entries(files)) {
        fs.writeFileSync(path.join(dbDir, dirName, `${id}.json`), JSON.stringify(report));
      }
    }
    process.env.DB_DIR = dbDir;
    run(dbDir);
  }
  finally {
    if (savedDBDir === undefined) {
      delete process.env.DB_DIR;
    }
    else {
      process.env.DB_DIR = savedDBDir;
    }
    fs.rmSync(dbDir, {recursive: true, force: true});
  }
};
// Returns a report.
const getReport = (what: string, url: string, creationTimeStamp: string, endTime: string) => ({
  id: 'x',
  creationTimeStamp,
  target: {what, url},
  sources: {application: 'Kilotest', worker: 'w1'},
  jobData: {endTime},
  acts: []
});
// Returns all report files in the data directory.
const getAllReportFiles = (dbDir: string) => [
  ...getReportFiles(path.join(dbDir, 'reports')).files,
  ...getReportFiles(path.join(dbDir, 'hiddenReports')).files
];
// Returns a report file’s content.
const readReport = (dbDir: string, dirName: string, id: string) => JSON.parse(
  fs.readFileSync(path.join(dbDir, dirName, `${id}.json`), 'utf8')
);

// CONSTANTS

const entries: MappingEntry[] = [
  {description: 'FIRE', site: 'Foundation for Individual Rights and Expression', page: 'home'},
  {description: 'FIRE (FIRE)', site: 'Foundation for Individual Rights and Expression', page: 'home'},
  {description: 'FIRE (FIRE) mission', site: 'Foundation for Individual Rights and Expression', page: 'mission'},
  {description: 'Farm Sanctuary', site: 'Farm Sanctuary', page: 'home'}
];
const reports = {
  r1: getReport('FIRE', 'https://www.fire.org/', '260503T1704', '26-05-03T17:08'),
  r2: getReport('FIRE (FIRE)', 'https://www.thefire.org/', '261012T1913', '26-10-12T19:17'),
  r3: getReport('FIRE (FIRE) mission', 'https://www.thefire.org/about-us/mission/', '261012T2043', '26-10-12T20:47'),
  r4: getReport('Farm Sanctuary', 'https://www.farmsanctuary.org/home', '261007T2112', '26-10-07T21:15')
};
const hiddenReports = {
  h1: getReport('Farm Sanctuary', 'https://www.farmsanctuary.org/', '260101T0000', '26-01-01T00:04')
};

// TESTS

test('getMappingEntries accepts a valid mapping and strips other properties', () => {
  const result = getMappingEntries({pages: [{description: 'A', site: 'A', page: 'home', flags: [], urls: []}]});
  assert.deepEqual(result, [{description: 'A', site: 'A', page: 'home'}]);
});
test('getMappingEntries rejects missing, empty, badly spaced, and duplicate values', () => {
  assert.deepEqual(getMappingEntries({}), {error: 'The mapping has no pages array.'});
  const result = getMappingEntries({pages: [
    {description: 'A', site: 'A'},
    {description: 'B', site: ' B', page: 'home'},
    {description: 'C', site: 'C', page: 'a  b'},
    {description: 'D', site: 'D', page: ''},
    {description: 'E', site: 'E', page: 'home'},
    {description: 'E', site: 'E', page: 'home'},
    null
  ]});
  assert.ok('error' in result);
  const lines = result.error.split('\n');
  assert.equal(lines.length, 6);
  assert.match(lines[0]!, /“A” lacks/);
  assert.match(lines[1]!, /“B” has an empty or badly spaced site/);
  assert.match(lines[2]!, /“C” has an empty or badly spaced page/);
  assert.match(lines[3]!, /“D” has an empty or badly spaced page/);
  assert.match(lines[4]!, /“E” appears more than once/);
  assert.match(lines[5]!, /entry 6 lacks/);
});
test('getPlan merges descriptions with identical sites and pages and covers hidden reports', () => {
  withDB(reports, hiddenReports, dbDir => {
    const plan = getPlan(entries, getAllReportFiles(dbDir), {sites: {}, pages: {}});
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(plan.warnings, []);
    assert.equal(plan.newSiteIDs.length, 2);
    assert.equal(plan.newPageIDs.length, 3);
    assert.equal(plan.updates.length, 5);
    assert.deepEqual(plan.merges, [{
      siteName: 'Foundation for Individual Rights and Expression',
      pageName: 'home',
      descriptions: ['FIRE', 'FIRE (FIRE)']
    }]);
    for (const siteID of plan.newSiteIDs) {
      assert.match(siteID, /^s-[0-9a-z]{6}$/);
    }
    for (const pageID of plan.newPageIDs) {
      assert.match(pageID, /^p-[0-9a-z]{8}$/);
    }
    const fireHome = Object.values(plan.registry.pages).find(page => page.name === 'home' && page.url.includes('fire'));
    // A merged page takes the URL of its latest report.
    assert.deepEqual(fireHome, {sites: [fireHome?.sites[0]], name: 'home', url: 'https://www.thefire.org/'});
    assert.deepEqual(
      Object.values(plan.registry.sites).sort(), ['Farm Sanctuary', 'Foundation for Individual Rights and Expression']
    );
    const farmHome = Object.values(plan.registry.pages).find(page => page.url.includes('farm'));
    assert.equal(farmHome?.url, 'https://www.farmsanctuary.org/home');
  });
});
test('getPlan refuses reports with unmapped, missing, or unregistered identities', () => {
  const badReports = {
    ...reports,
    r5: getReport('Unknown page', 'https://unknown.example/', '261012T1913', '26-10-12T19:17'),
    r6: {target: {}},
    r7: {...getReport('Farm Sanctuary', 'https://www.farmsanctuary.org/', '261012T1913', '26-10-12T19:17'), sources: {pageID: 'p-missing1'}}
  };
  withDB(badReports, {}, dbDir => {
    const plan = getPlan(entries, getAllReportFiles(dbDir), {sites: {}, pages: {}});
    assert.equal(plan.errors.length, 3);
    assert.match(plan.errors[0]!, /“Unknown page”, which has no mapping entry/);
    assert.match(plan.errors[1]!, /has no target description/);
    assert.match(plan.errors[2]!, /p-missing1, which is not in the registry/);
    assert.equal(plan.alreadyMigrated, 1);
  });
});
test('getPlan warns about mapping entries that no report needs', () => {
  withDB({r4: reports.r4}, {}, dbDir => {
    const plan = getPlan(entries, getAllReportFiles(dbDir), {sites: {}, pages: {}});
    assert.deepEqual(plan.warnings, ['3 mapping entries have no unmigrated report.']);
  });
  withDB({r1: reports.r1, r2: reports.r2, r3: reports.r3}, {}, dbDir => {
    const plan = getPlan(entries, getAllReportFiles(dbDir), {sites: {}, pages: {}});
    assert.deepEqual(plan.warnings, ['1 mapping entry has no unmigrated report.']);
  });
});
test('applyPlan writes the registry and adds only the four sources properties', () => {
  withDB(reports, hiddenReports, dbDir => {
    const plan = getPlan(entries, getAllReportFiles(dbDir), getRegistrySync());
    applyPlan(plan);
    const registry: Registry = getRegistrySync();
    assert.deepEqual(registry, plan.registry);
    const before = reports.r2;
    const after = readReport(dbDir, 'reports', 'r2');
    const {sources, ...rest} = after;
    const {sources: beforeSources, ...beforeRest} = before;
    assert.deepEqual(rest, beforeRest);
    assert.equal(sources.application, beforeSources.application);
    assert.equal(sources.worker, beforeSources.worker);
    assert.equal(sources.siteName, 'Foundation for Individual Rights and Expression');
    assert.equal(sources.pageName, 'home');
    assert.equal(registry.sites[sources.siteID], sources.siteName);
    assert.deepEqual(registry.pages[sources.pageID]?.sites, [sources.siteID]);
    // The merged descriptions share one page.
    assert.equal(readReport(dbDir, 'reports', 'r1').sources.pageID, sources.pageID);
    // Hidden reports are migrated too.
    assert.equal(typeof readReport(dbDir, 'hiddenReports', 'h1').sources.pageID, 'string');
    // No temporary file remains.
    assert.deepEqual(fs.readdirSync(path.join(dbDir, 'reports')).filter(name => !name.endsWith('.json')), []);
    assert.ok(fs.existsSync(registryPath()));
  });
});
test('a rerun after restoration reuses the registry identifiers and changes nothing else', () => {
  withDB(reports, hiddenReports, dbDir => {
    applyPlan(getPlan(entries, getAllReportFiles(dbDir), getRegistrySync()));
    const registry = getRegistrySync();
    const migratedR3 = readReport(dbDir, 'reports', 'r3');
    // Restore one report from an older backup, without identifiers.
    fs.writeFileSync(path.join(dbDir, 'reports', 'r3.json'), JSON.stringify(reports.r3));
    const plan = getPlan(entries, getAllReportFiles(dbDir), registry);
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.alreadyMigrated, 4);
    assert.deepEqual([plan.newSiteIDs, plan.newPageIDs], [[], []]);
    assert.equal(plan.updates.length, 1);
    applyPlan(plan);
    assert.deepEqual(getRegistrySync(), registry);
    assert.deepEqual(readReport(dbDir, 'reports', 'r3').sources, migratedR3.sources);
  });
});
test('getReportFiles lists unreadable files and tolerates a missing directory', () => {
  withDB({r1: reports.r1}, {}, dbDir => {
    fs.writeFileSync(path.join(dbDir, 'reports', 'bad.json'), '{');
    const result = getReportFiles(path.join(dbDir, 'reports'));
    assert.equal(result.files.length, 1);
    assert.deepEqual(result.unreadable, [path.join(dbDir, 'reports', 'bad.json')]);
    assert.deepEqual(getReportFiles(path.join(dbDir, 'absent')), {files: [], unreadable: []});
  });
});
