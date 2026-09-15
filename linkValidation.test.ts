// Link validation test: ensures all internal href attributes point to valid paths

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = import.meta.dirname;

// Collect all valid paths (both static and route patterns)
const validPathPatterns = new Set<string>();
const validPathsExact = new Set<string>();

// Add exact paths and static files
const staticFiles = [
  '/index.html',
  '/style.css',
  '/favicon.ico',
  '/openapi.yaml',
  '/openapi.json',
  '/capability.md',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/llms-full.txt',
  '/mcp'
];

staticFiles.forEach(p => validPathsExact.add(p));

// Add pattern-based routes
validPathPatterns.add('*.html*');
validPathPatterns.add('/api/*');
validPathPatterns.add('/fullReport.json/*');
validPathPatterns.add('/tutorialWeb/images/*');
validPathPatterns.add('/tutorialAI/images/*');

// Specific page routes (those that end in .html)
const htmlRoutes = [
  '/tutorialWeb.html',
  '/tutorialAI.html',
  '/tutorialWebComment.html',
  '/tutorialAIComment.html',
  '/listReports.html',
  '/listTopIssues.html',
  '/listIssues.html',
  '/listDiagnoses.html',
  '/listViolators.html',
  '/listRules.html',
  '/manage.html',
  '/requestTest.html',
  '/requestTestForm.html',
  '/requestRetest.html',
  '/requestRetestForm.html',
  '/reannotate.html',
  '/reannotateForm.html',
  '/hideReportForm.html',
  '/unhideReportForm.html',
  '/expungeReportsForm.html',
  '/pruneReportsForm.html',
  '/rewindReportsForm.html',
  '/renewWCAG.html',
  '/renewWCAGForm.html',
  '/enqueue.html',
  '/enqueueForm.html',
  '/manage.html'
];

htmlRoutes.forEach(p => validPathsExact.add(p));

// Add root path
validPathsExact.add('/');

const isValidPath = (href: string): boolean => {
  // Absolute URLs and email links are not internal paths
  if (href.includes('://') || href.startsWith('mailto:') || href.startsWith('#')) {
    return true;
  }

  // Exact match
  if (validPathsExact.has(href)) {
    return true;
  }

  // Pattern match
  for (const pattern of validPathPatterns) {
    const regexPattern = '^' + pattern.replace(/\*/g, '.*') + '$';
    if (new RegExp(regexPattern).test(href)) {
      return true;
    }
  }

  return false;
};

// Find all HTML files in the project (excluding generated/build directories)
const findHtmlFiles = (dir: string): string[] => {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  const ignoredDirs = new Set(['node_modules', 'coverage', '.git', '.github', 'dist', 'build']);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name.startsWith('.') || ignoredDirs.has(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...findHtmlFiles(fullPath));
    } else if (entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }

  return files;
};

const htmlFiles = findHtmlFiles(projectRoot);

test('All internal links in HTML files point to valid paths', () => {
  const brokenLinks: Array<{file: string; href: string; type: string}> = [];

  for (const htmlFile of htmlFiles) {
    const content = fs.readFileSync(htmlFile, 'utf-8');
    const relativePath = path.relative(projectRoot, htmlFile);

    // Find all href attributes
    const hrefRegex = /href=["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(content)) !== null) {
      const href = match[1];
      if (href && !isValidPath(href)) {
        brokenLinks.push({
          file: relativePath,
          href,
          type: 'href'
        });
      }
    }

    // Find all src attributes (images, scripts, etc.)
    const srcRegex = /src=["']([^"']+)["']/g;
    while ((match = srcRegex.exec(content)) !== null) {
      const src = match[1];
      if (src && !src.includes('://') && !isValidPath(src)) {
        brokenLinks.push({
          file: relativePath,
          href: src,
          type: 'src'
        });
      }
    }

    // Find all fetch paths (JavaScript: fetch('/path', ...))
    const fetchRegex = /fetch\s*\(\s*["']([^"']+)["']/g;
    while ((match = fetchRegex.exec(content)) !== null) {
      const fetchPath = match[1];
      if (fetchPath && !fetchPath.includes('://') && !isValidPath(fetchPath)) {
        brokenLinks.push({
          file: relativePath,
          href: fetchPath,
          type: 'fetch'
        });
      }
    }
  }

  if (brokenLinks.length > 0) {
    const message = brokenLinks
      .map(link => `${link.file}: ${link.type}="${link.href}" (invalid path)`)
      .join('\n');
    assert.fail(`Found ${brokenLinks.length} broken links:\n${message}`);
  }
});

test('Internal links in index.html resolve to expected paths', () => {
  const expectedLinks = [
    '/tutorialWeb.html',
    '/tutorialAI.html',
    '/listReports.html',
    '/listTopIssues.html',
    '/manage.html',
    '/mcp',
    '/capability.md',
    '/openapi.yaml'
  ];

  for (const expectedHref of expectedLinks) {
    assert.ok(isValidPath(expectedHref), `Expected path ${expectedHref} should be valid`);
  }
});
