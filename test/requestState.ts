/*
  test/requestState.ts
  Resets the request-related state of the disposable fixture database between tests: the pending requests, the registry, and the queued and claimed jobs.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import {fixtureDBDir} from './dbFixture.ts';

// FUNCTIONS

// Restores the pending requests and the registry of the fixture database and removes its queued and claimed jobs.
export const resetRequestState = (): void => {
  fs.writeFileSync(path.join(fixtureDBDir, 'jobs', 'testRequests.json'), '{}\n');
  fs.copyFileSync(path.join(import.meta.dirname, 'fixtures', 'db', 'registry.json'), path.join(fixtureDBDir, 'registry.json'));
  for (const category of ['queue', 'claimed']) {
    const dir = path.join(fixtureDBDir, 'jobs', category);
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir);
  }
};
// Writes a job file into a job category of the fixture database.
export const writeFixtureJob = (category: 'queue' | 'claimed', name: string, job: unknown): void => {
  fs.writeFileSync(path.join(fixtureDBDir, 'jobs', category, `${name}.json`), JSON.stringify(job));
};
// Returns the pending requests of the fixture database.
export const readFixtureRequests = (): Record<string, {id: string; target: unknown; referred: boolean}[]> => JSON.parse(
  fs.readFileSync(path.join(fixtureDBDir, 'jobs', 'testRequests.json'), 'utf8')
);
