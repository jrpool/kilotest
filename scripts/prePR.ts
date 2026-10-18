/*
  prePR.ts
  Prepares a release pull request on the current feature branch: verifies a clean working tree, bumps the package version, regenerates the generated files (openapi.yaml, openapi-3.0.yaml, server.json, and lhm.plugin.json), commits and pushes the result, records the branch name for postPR.ts, and prints the remaining manual steps. The generation is run explicitly because the project's .npmrc sets ignore-scripts=true, which disables the npm "version" lifecycle hook that would otherwise run it.
*/

// IMPORTS

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// CONSTANTS

const levels = ['major', 'minor', 'patch'];
const usage = 'Usage: npm run prePR -- <major|minor|patch>';
const markerFile = 'kilotest-pr-branch';

// FUNCTIONS

// Runs a command with inherited stdio and throws on failure.
const run = (command: string, args: string[]): void => {
  if (spawnSync(command, args, {stdio: 'inherit'}).status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
};
// Runs a command and returns its trimmed standard output.
const capture = (command: string, args: string[]): string => {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
};
// Returns the absolute path of a file inside the git directory.
const gitPath = (name: string): string =>
  path.join(capture('git', ['rev-parse', '--absolute-git-dir']), name);
// Exits unless the working tree is clean, so all substantive changes are committed before the version bump.
const requireCleanTree = (): void => {
  const dirty = capture('git', ['status', '--porcelain']);
  if (dirty) {
    console.error(`Working tree is not clean. Commit or stash all changes first:\n${dirty}`);
    process.exit(1);
  }
};

// EXECUTION

const level = process.argv[2] ?? '';
if (!levels.includes(level)) {
  console.error(usage);
  process.exit(1);
}
const branch = capture('git', ['branch', '--show-current']);
if (!branch || branch === 'main') {
  console.error('prePR must run on a feature branch, not on main');
  process.exit(1);
}
requireCleanTree();
run('npm', ['version', level, '--no-git-tag-version']);
run('npm', ['run', 'generate']);
run('git', ['add', '-A']);
run('git', ['commit', '-m', 'update version and generated files']);
run('git', ['push', '-u', 'origin', branch]);
fs.writeFileSync(gitPath(markerFile), `${branch}\n`);
console.log('Submit a pull request, merge it to main, then run: npm run postPR');
