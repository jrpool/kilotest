/*
  postPR.ts
  Finalizes a release after the prePR pull request has been merged: checks out main, pulls, verifies that the merge landed, publishes to npm, updates the LobeHub listing, deletes the feature branch, and prunes remote-tracking branches. The feature-branch name is read from the marker file written by prePR.ts, or from an optional command-line argument. Publishing to npm and to LobeHub are run explicitly because the project's .npmrc sets ignore-scripts=true, which disables the npm "postpublish" lifecycle hook that would otherwise update LobeHub.
*/

// IMPORTS

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// CONSTANTS

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
// Exits unless the working tree is clean.
const requireCleanTree = (): void => {
  const dirty = capture('git', ['status', '--porcelain']);
  if (dirty) {
    console.error(`Working tree is not clean. Commit or stash all changes first:\n${dirty}`);
    process.exit(1);
  }
};
// Returns the version field of package.json, either from the working tree or from a git ref.
const versionOf = (ref?: string): string => {
  const content = ref
    ? capture('git', ['show', `${ref}:package.json`])
    : fs.readFileSync('package.json', 'utf8');
  return JSON.parse(content).version;
};

// EXECUTION

const marker = gitPath(markerFile);
const argBranch = process.argv[2] ?? '';
const branch = argBranch ||
  (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '');
if (!branch) {
  console.error('No feature branch recorded. Run prePR first, or pass the branch name: npm run postPR -- <branch>');
  process.exit(1);
}
if (branch === 'main') {
  console.error('Refusing to treat main as the feature branch');
  process.exit(1);
}
if (!capture('git', ['branch', '--list', branch])) {
  console.error(`Branch ${branch} does not exist locally; it may already have been deleted`);
  process.exit(1);
}
requireCleanTree();
run('git', ['checkout', 'main']);
run('git', ['pull', '--ff-only']);
// Aborts if the pull request has not been merged: under squash-merges the feature branch is never an ancestor of main, so version equality is the merge check.
const branchVersion = versionOf(branch);
const mainVersion = versionOf();
if (branchVersion !== mainVersion) {
  console.error(`main is at version ${mainVersion} but ${branch} is at ${branchVersion}; merge the pull request first`);
  process.exit(1);
}
run('npm', ['login']);
run('npm', ['publish']);
run('npm', ['run', 'publish:lhm']);
// Branch cleanup is best-effort: deletion must precede pruning, because "git branch -d" checks mergedness against the upstream ref, which pruning would remove.
const deleted = spawnSync('git', ['branch', '-d', branch], {stdio: 'inherit'});
if (deleted.status !== 0) {
  console.warn(`Could not delete ${branch}; delete it after confirming the merge`);
}
if (spawnSync('git', ['remote', 'prune', 'origin'], {stdio: 'inherit'}).status !== 0) {
  console.warn('git remote prune origin failed');
}
fs.rmSync(marker, {force: true});
console.log('Release complete');
