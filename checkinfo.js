/*
  checkinfo.js
  Summarizes the validation scope of the lint, test, and test:smoke scripts by deriving file and test-case counts from their actual configurations, so the summary stays accurate as the codebase changes.
*/

// IMPORTS

const fs = require('fs');
const path = require('path');

// CONSTANTS

const rootDir = __dirname;
const excludeDirs = new Set(['node_modules', '.git', 'coverage']);

// FUNCTIONS

// Recursively collects all files under a directory, skipping excluded directories.
const collectFiles = (dir) => {
  const results = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludeDirs.has(entry.name)) {
        results.push(...collectFiles(fullPath));
      }
    }
    else {
      results.push(fullPath);
    }
  }
  return results;
};

// Converts a glob pattern to a RegExp for matching relative paths.
// Supports * (non-segment), ** (any), and literal characters.
const globToRegExp = (pattern) => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');
  return new RegExp('^' + escaped + '$');
};

// Returns whether a relative path matches any pattern in a list.
const matchesAny = (relPath, patterns) => patterns.some(p => globToRegExp(p).test(relPath));

// Extracts the top-level ignores array from eslint.config.mjs.
const getEslintIgnores = () => {
  const content = fs.readFileSync(path.join(rootDir, 'eslint.config.mjs'), 'utf8');
  const match = content.match(/ignores:\s*\[([\s\S]*?)\]/);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
};

// Parses .markdownlint-cli2.jsonc and returns its ignores array.
const getMarkdownlintIgnores = () => {
  const content = fs.readFileSync(path.join(rootDir, '.markdownlint-cli2.jsonc'), 'utf8');
  const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const match = stripped.match(/"ignores"\s*:\s*\[([\s\S]*?)\]/);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
};

// Counts test() calls in a file, matching calls at the start of a line.
const countTestCases = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(/^\s*test\s*\(/gm);
  return matches ? matches.length : 0;
};

// MAIN

const allFiles = collectFiles(rootDir);
const relFiles = allFiles.map(f => path.relative(rootDir, f));

const eslintIgnores = getEslintIgnores();
const markdownlintIgnores = getMarkdownlintIgnores();

// ESLint file counts by extension, excluding ignored files.
const eslintExts = {js: 0, json: 0, md: 0, css: 0};
for (const rel of relFiles) {
  if (matchesAny(rel, eslintIgnores)) {
    continue;
  }
  if (/\.(js|mjs|cjs)$/.test(rel)) {
    eslintExts.js++;
  }
  else if (/\.json$/.test(rel)) {
    eslintExts.json++;
  }
  else if (/\.md$/.test(rel)) {
    eslintExts.md++;
  }
  else if (/\.css$/.test(rel)) {
    eslintExts.css++;
  }
}
const eslintTotal = Object.values(eslintExts).reduce((a, b) => a + b, 0);

// markdownlint file count (markdown files not ignored).
const markdownlintCount = relFiles.filter(
  rel => rel.endsWith('.md') && !matchesAny(rel, markdownlintIgnores)
).length;

// Test file and test-case counts.
const testFiles = relFiles.filter(rel => /\.test\.js$/.test(rel));
const testCaseCount = testFiles.reduce(
  (sum, file) => sum + countTestCases(path.join(rootDir, file)),
  0
);

// Smoke-test path counts from the routes table in index.js.
const {routes} = require('./index');
const smokeGetCount = routes.GET.length;
const smokePostCount = routes.POST.length;
const smokeTotal = smokeGetCount + smokePostCount;

// OUTPUT

const parts = [
  ['lint', [
    `ESLint: ${eslintTotal} files (${eslintExts.js} JS, ${eslintExts.json} JSON, ${eslintExts.md} MD, ${eslintExts.css} CSS)`,
    `markdownlint: ${markdownlintCount} files`
  ]],
  ['test', [
    `${testFiles.length} test files, ${testCaseCount} test cases`
  ]],
  ['test:smoke', [
    `${smokeTotal} paths (${smokeGetCount} GET, ${smokePostCount} POST)`
  ]]
];

console.log('Validation summary:');
for (const [name, lines] of parts) {
  console.log(`  ${name}:`);
  for (const line of lines) {
    console.log(`    ${line}`);
  }
}
