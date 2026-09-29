/*
  version.ts
  Single source of truth for the version of the Kilotest API and MCP tool contract, consumed by mcp.ts and scripts/generate-openapi.ts. Re-exports package.json's version field verbatim, rather than hand-maintaining a separate literal here, so MCP and OpenAPI consumers see package.json's version exactly, including minor/patch bumps from changes that do not affect the API contract; this is a deliberate choice, not an oversight.
*/

// IMPORTS

import pkg from '../package.json' with {type: 'json'};

// CONSTANTS

export const version = pkg.version;
