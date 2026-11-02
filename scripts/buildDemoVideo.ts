/*
  buildDemoVideo.ts
  Rebuilds the ChatGPT demonstration video, media/demo-chatgpt.mp4, from the slide frames and durations listed in media/demo-chatgpt-src/demo_list.txt. Each listed frame is shown for its duration in whole seconds. The video is encoded at one frame per second, which keeps the file small because the slides are static, and its length is set to the sum of the durations.

  Usage:
    npm run build:media [outputPath]

  outputPath defaults to media/demo-chatgpt.mp4. Requires ffmpeg on the PATH, for example from Homebrew (brew install ffmpeg). See media/README.md.
*/

// IMPORTS

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CONSTANTS

const repoDir = path.join(import.meta.dirname, '..');
const sourceDir = path.join(repoDir, 'media', 'demo-chatgpt-src');
const listPath = path.join(sourceDir, 'demo_list.txt');
const outputPath = path.resolve(process.argv[2] ?? path.join(repoDir, 'media', 'demo-chatgpt.mp4'));
// One frame per second suffices because durations are whole seconds and the slides do not animate.
const FRAME_RATE = 1;

// FUNCTIONS

// Reads the concat list into entries, each with a frame file name and, except for a final repeat, a duration in seconds.
const readEntries = (): {fileName: string; seconds?: number}[] => {
  const entries: {fileName: string; seconds?: number}[] = [];
  const lines = fs.readFileSync(listPath, 'utf8').split('\n').map(line => line.trim()).filter(line => line !== '');
  for (const line of lines) {
    const fileMatch = line.match(/^file '(.+)'$/);
    const durationMatch = line.match(/^duration (\d+)$/);
    const previous = entries.at(-1);
    if (fileMatch) {
      if (previous && previous.seconds === undefined) {
        throw new Error(`No duration follows ${previous.fileName} in ${listPath}`);
      }
      entries.push({fileName: fileMatch[1] ?? ''});
    }
    else if (durationMatch && previous && previous.seconds === undefined) {
      previous.seconds = Number(durationMatch[1]);
    }
    else {
      throw new Error(`Unexpected line in ${listPath}: ${line}`);
    }
  }
  return entries;
};

// Returns the slides to show, each with an absolute frame path and a duration. The final file may repeat without a duration, as the concat format requires, and must then repeat the file before it.
const readSlides = (): {framePath: string; seconds: number}[] => {
  const entries = readEntries();
  const last = entries.at(-1);
  const timed = last?.seconds === undefined ? entries.slice(0, -1) : entries;
  if (last?.seconds === undefined && last?.fileName !== timed.at(-1)?.fileName) {
    throw new Error(`The final file without a duration must repeat the file before it in ${listPath}`);
  }
  const slides = timed.map(entry => ({
    framePath: path.resolve(sourceDir, entry.fileName),
    seconds: entry.seconds ?? 0
  }));
  if (!slides.length) {
    throw new Error(`No slides found in ${listPath}`);
  }
  const missing = slides.filter(slide => !fs.existsSync(slide.framePath)).map(slide => slide.framePath);
  if (missing.length) {
    throw new Error(`Missing frame files:\n${missing.join('\n')}`);
  }
  return slides;
};

// Serializes slides as an ffmpeg concat list. The final frame is listed again without a duration, which ffmpeg needs to show it for its full duration.
const getConcatList = (slides: {framePath: string; seconds: number}[]): string => {
  const lines = slides.flatMap(slide => [
    `file '${slide.framePath.replaceAll("'", "'\\''")}'`,
    `duration ${slide.seconds}`
  ]);
  const last = slides.at(-1);
  if (last) {
    lines.push(`file '${last.framePath.replaceAll("'", "'\\''")}'`);
  }
  return `${lines.join('\n')}\n`;
};

// Runs ffmpeg with the given arguments and throws on failure.
const runFfmpeg = (args: string[]): void => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'});
  if (result.error) {
    throw new Error('ffmpeg is not available. Install it (for example, with brew install ffmpeg) and try again.');
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr.trim()}`);
  }
};

// OPERATION

const slides = readSlides();
const totalSeconds = slides.reduce((sum, slide) => sum + slide.seconds, 0);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-chatgpt-'));
try {
  const concatPath = path.join(tempDir, 'concat.txt');
  fs.writeFileSync(concatPath, getConcatList(slides));
  runFfmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatPath,
    '-vf', `fps=${FRAME_RATE},format=yuv420p`,
    '-t', String(totalSeconds),
    '-c:v', 'libx264',
    '-movflags', '+faststart',
    outputPath
  ]);
}
finally {
  fs.rmSync(tempDir, {recursive: true, force: true});
}
console.log(`Wrote ${outputPath}: ${slides.length} slides, ${totalSeconds} seconds`);
