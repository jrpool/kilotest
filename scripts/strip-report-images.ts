/*
  strip-report-images.ts
  Replaces the base64 page-image payloads in report images arrays with the marker string "deleted", cutting the bulk of each report while leaving every other property untouched. Array length is preserved, so checkpoints[].imageIndexes still resolves to a real element, and job properties such as imageColor remain as a record of what the job specified.

  Usage:
    node scripts/strip-report-images.ts [--dry-run] [reportsDir]

  reportsDir defaults to db/reports. Run it once per report directory (reports, hiddenReports). With --dry-run, reports are analyzed and the changes are listed but no file is written.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';

// CONSTANTS

const DRY_RUN = process.argv.includes('--dry-run');
const reportsDir = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--'))
?? path.join(import.meta.dirname, '..', 'db', 'reports');
const STUB = 'deleted';

// FUNCTIONS

// Serializes an object exactly as Kilotest writes reports (util.getJSON).
const getJSON = (object: unknown): string => `${JSON.stringify(object, null, 2)}\n`;

// OPERATION

const fileNames = fs.readdirSync(reportsDir).filter(name => name.endsWith('.json'));
if (!fileNames.length) {
  console.log(`No report files found in ${reportsDir}`);
  process.exit(0);
}
let revised = 0;
let skipped = 0;
for (const fileName of fileNames) {
  const filePath = path.join(reportsDir, fileName);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  catch (error) {
    console.log(`${fileName}: SKIPPED (unreadable or not JSON: ${(error as Error).message})`);
    skipped++;
    continue;
  }
  const {images} = report;
  const needsStubbing = Array.isArray(images) && images.some(image => image !== STUB);
  if (!needsStubbing) {
    skipped++;
    continue;
  }
  const freedBytes = images
  .filter((image: unknown) => image !== STUB)
  .reduce((total: number, image: any) => total + String(image).length, 0);
  report.images = images.map(() => STUB);
  revised++;
  console.log(
    `${fileName}:${DRY_RUN ? ' (dry run)' : ''} stubbed ${images.length} image(s), `
    + `freed ~${Math.round(freedBytes / 1024)} KB`
  );
  if (!DRY_RUN) {
    fs.writeFileSync(filePath, getJSON(report));
  }
}
console.log(`Done: ${revised} report(s) ${DRY_RUN ? 'would be ' : ''}revised, ${skipped} skipped.`);
