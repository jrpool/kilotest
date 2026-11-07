/*
  generate-llms.ts
  Regenerates the opening paragraph of llms.txt from content.ts's sharedContext, the single
  source of truth content.ts already documents that paragraph as reusing (along with the MCP
  server instructions, the openapi.yaml description, and the getOverview tool
  description). Leaves the rest of llms.txt untouched, because it has no canonical source
  elsewhere in the repository. Exports the expected paragraph so scripts/check-docs.ts can
  reject hand-edits of it; the file write is main-guarded so importing that export has no
  side effects.
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
// Exported, rather than kept private, so scripts/check-docs.ts can verify that llms.txt's
// opening paragraph still matches the generated text instead of being silently reverted by
// the next regeneration.
export const openingParagraph = `${sharedContext}${openingSuffix}`;

// EXECUTION

if (import.meta.main) {
  const lines = fs.readFileSync(outputPath, 'utf8').split('\n');
  const paragraphIndex = lines.findIndex(line => line.startsWith('Kilotest integrates an ensemble of'));
  if (paragraphIndex === -1) {
    throw new Error(`Could not find the opening paragraph to regenerate in ${outputPath}`);
  }
  lines[paragraphIndex] = openingParagraph;
  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`Wrote ${outputPath}`);
}
