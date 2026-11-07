/*
  generate-llms.ts
  Regenerates the opening paragraph of llms.txt from content.ts's sharedContext, the single
  source of truth content.ts already documents that paragraph as reusing (along with the MCP
  server instructions, the openapi.yaml description, and the getOverview tool
  description). Leaves the rest of llms.txt untouched, because it has no canonical source
  elsewhere in the repository.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import {sharedContext} from '../content.ts';

// CONSTANTS

const outputPath = path.join(import.meta.dirname, '..', 'llms.txt');
// Text appended after sharedContext to form the full opening paragraph; unlike sharedContext,
// this sentence is specific to llms.txt (it is not reused anywhere else), so it lives here
// rather than in content.ts.
const openingSuffix = ' Kilotest features are available via a web UI, an API, and an MCP server with streamable HTTP and no authentication.';
const openingParagraph = `${sharedContext}${openingSuffix}`;

// EXECUTION

const lines = fs.readFileSync(outputPath, 'utf8').split('\n');
const paragraphIndex = lines.findIndex(line => line.startsWith('Kilotest integrates an ensemble of'));
if (paragraphIndex === -1) {
  throw new Error(`Could not find the opening paragraph to regenerate in ${outputPath}`);
}
lines[paragraphIndex] = openingParagraph;
fs.writeFileSync(outputPath, lines.join('\n'));
console.log(`Wrote ${outputPath}`);
