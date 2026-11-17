/*
  generate-llms.ts
  Regenerates the opening paragraph of llms.txt and llms-full.txtfrom content.ts's sharedContext, the single source of truth content.ts already documents that paragraph as reusing (along with the MCP server instructions, the openapi.yaml description, and the getOverview tool description). Leaves the rest of llms.txt untouched, because it has no canonical source elsewhere in the repository. Exports the expected paragraph so scripts/check-docs.ts can reject hand-edits of it; the file write is main-guarded so importing that export has no side effects.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import {sharedContext} from '../content.ts';

// CONSTANTS

const outputPaths = [
  path.join(import.meta.dirname, '..', 'llms.txt'),
  path.join(import.meta.dirname, '..', 'llms-full.txt'),
  path.join(import.meta.dirname, '..', 'capability.md'),
];

// EXECUTION

if (import.meta.main) {
  for (const outputPath of outputPaths) {
    const lines = fs.readFileSync(outputPath, 'utf8').split('\n');
    const paragraphIndex = lines.findIndex(line => line.startsWith('Kilotest'));
    if (paragraphIndex === -1) {
      throw new Error(`Could not find the opening paragraph to regenerate in ${outputPath}`);
    }
    lines[paragraphIndex] = sharedContext;
    fs.writeFileSync(outputPath, lines.join('\n'));
    console.log(`Wrote ${outputPath}`);
  }
}
