/*
  routeAuth.ts
  Route authorization: the path of the MCP endpoint, the table of authorized
  paths composed from per-interface lists, and the gate that checks requests
  against it.
*/

// IMPORTS

import {apiRoutePaths} from './api/routePaths.ts';
import {webRoutePaths} from './web/routePaths.ts';
import {workerRoutePaths} from './worker/routePaths.ts';

// CONSTANTS

// The path of the model context protocol endpoint.
export const mcpPath = '/mcp';
// Paths that the application is authorized to handle, by method, as glob-style
// patterns where * matches any sequence of characters. Each marked interface
// owns its own list; the unmarked static and metadata assets are listed here.
export const routes = {
  GET: [
    ...webRoutePaths.GET,
    ...apiRoutePaths.GET,
    mcpPath,
    '/.well-known/*',
    '/api-docs',
    '/capability.md',
    '/favicon.*',
    '/fullReport.json/*',
    '/llms-full.txt',
    '/llms.txt',
    '/logo.png',
    '/media/*',
    '/openapi.json',
    '/openapi.yaml',
    '/robots.txt',
    '/sitemap.xml',
    '/style.css',
    '/swagger.json',
    '/swagger.yaml',
    '/tutorialWeb/images/*',
    '/tutorialAI/images/*'
  ],
  POST: [
    ...webRoutePaths.POST,
    ...apiRoutePaths.POST,
    ...workerRoutePaths.POST,
    mcpPath
  ]
};

// FUNCTIONS

// Returns whether a pathname matches a glob-style pattern.
const matchPath = (pattern: string, pathname: string) => {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  );
  return regex.test(pathname);
};
// Returns whether a pathname is authorized for a method.
export const isPathAllowed = (method: string, pathname: string): boolean => {
  const patterns = (routes as Record<string, string[]>)[method] || [];
  return patterns.some(pattern => matchPath(pattern, pathname));
};
