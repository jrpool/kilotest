/*
  routes.test.ts
  Tests for the centralized routes table exported from index.js.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routes} from './index.ts';

// TESTS

test('routes has GET and POST arrays', () => {
  assert.ok(Array.isArray(routes.GET));
  assert.ok(Array.isArray(routes.POST));
  assert.ok(routes.GET.length > 0);
  assert.ok(routes.POST.length > 0);
});

test('routes GET includes all known GET paths', () => {
  const required = [
    '/mcp',
    '/',
    '/index.html',
    '/robots.txt',
    '/openapi.yaml',
    '/openapi.json',
    '/swagger.yaml',
    '/swagger.json',
    '/api-docs',
    '/llms.txt',
    '/llms-full.txt',
    '/sitemap.xml',
    '/style.css'
  ];
  for (const path of required) {
    assert.ok(routes.GET.includes(path), `routes.GET missing ${path}`);
  }
});

test('routes POST includes all known POST paths', () => {
  const required = [
    '/mcp',
    '/requestTest.html',
    '/recAction.html',
    '/reannotate.html',
    '/renewWCAG.html',
    '/worker/job',
    '/worker/report',
    '/tutorialComment.html'
  ];
  for (const path of required) {
    assert.ok(routes.POST.includes(path), `routes.POST missing ${path}`);
  }
});

test('routes GET includes wildcard patterns for dynamic paths', () => {
  assert.ok(routes.GET.some(p => p.includes('fullReport.json')));
  assert.ok(routes.GET.some(p => p.includes('/api/')));
  assert.ok(routes.GET.some(p => p.includes('tutorial/images')));
  assert.ok(routes.GET.some(p => p.includes('favicon')));
  assert.ok(routes.GET.some(p => p.includes('.html')));
});

test('routes POST includes wildcard patterns for dynamic paths', () => {
  assert.ok(routes.POST.some(p => p.includes('requestRetest.html')));
  assert.ok(routes.POST.some(p => p.includes('/api/')));
});
