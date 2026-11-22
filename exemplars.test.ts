/*
  exemplars.test.ts
  Validates the exemplar pages in exemplars/ against exemplars/manifest.json, which
  declares each document's purpose and intended defects. Because the files contain
  deliberate defects, they are exempt from htmlhint; this test replaces that
  checking with manifest-driven validation, so that an accidental second defect
  cannot silently contaminate an exemplar (see docs/decisions/013-exemplar-pages.md).
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'node-html-parser';
import type {HTMLElement} from 'node-html-parser';

// CONSTANTS

const exemplarsDir = path.join(import.meta.dirname, 'exemplars');
const manifest = JSON.parse(
  await fs.readFile(path.join(exemplarsDir, 'manifest.json'), 'utf8')
);
// Checks of the shape of an element, by declared defect-set item type. Each
// returns whether the element has the declared type, given the element and its
// containing document.
const typeChecks: Record<string, (element: HTMLElement, doc: HTMLElement) => boolean> = {
  imgNoAlt: (element) =>
    element.tagName === 'IMG' && !element.hasAttribute('alt'),
  lowContrast: (element) =>
    /(^|\s)color\s*:/.test(element.getAttribute('style') ?? ''),
  unlabeledControl: (element, doc) => {
    const id = element.getAttribute('id');
    const labeled = doc.querySelectorAll('label')
    .some(label => label.getAttribute('for') === id);
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
      && !element.hasAttribute('aria-label')
      && !element.hasAttribute('aria-labelledby')
      && !labeled;
  },
  emptyLink: (element) =>
    element.tagName === 'A' && element.text.trim() === '',
  labeledImg: (element) =>
    element.tagName === 'IMG' && element.hasAttribute('alt'),
  styledText: (element) =>
    /(^|\s)color\s*:/.test(element.getAttribute('style') ?? ''),
  labeledControl: (element, doc) => {
    const id = element.getAttribute('id');
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
      && doc.querySelectorAll('label').some(label => label.getAttribute('for') === id);
  },
  nonemptyLink: (element) =>
    element.tagName === 'A' && element.text.trim() !== ''
};

// FUNCTIONS

// Returns a string with the standard HTML entities decoded.
const unescape = (text: string): string => text
.replace(/&lt;/g, '<')
.replace(/&gt;/g, '>')
.replace(/&quot;/g, '"')
.replace(/&#0?39;|&apos;/g, '\'')
.replace(/&amp;/g, '&');
// Returns the parsed HTML document of a file in the exemplars directory.
const getDoc = async (filePath: string): Promise<HTMLElement> =>
  parse(await fs.readFile(path.join(exemplarsDir, filePath), 'utf8'));
// Returns whether a document has the declared defect-set items of one kind.
const checkItems = (
  doc: HTMLElement,
  items: {id: string; type: string}[],
  label: string
) => {
  for (const {id, type} of items) {
    const element = doc.getElementById(id);
    assert.ok(element, `element ${id} is missing`);
    assert.ok(
      typeChecks[type]!(element, doc),
      `element ${id} does not have the ${label} type ${type}`
    );
  }
};
// Returns whether a parsed document has all the items of a defect set.
const checkDefectSet = (doc: HTMLElement, setName: string) => {
  const set = manifest.defectSets[setName];
  assert.ok(set, `unknown defect set ${setName}`);
  checkItems(doc, set.defects, 'defect');
  checkItems(doc, set.clean, 'clean');
};

// TESTS

test('the manifest lists every exemplar HTML file, and only existing files', async () => {
  const files = (await fs.readdir(exemplarsDir)).filter(name => name.endsWith('.html'));
  const listed = manifest.documents.map(({path: p}: {path: string}) => p);
  assert.deepEqual([...listed].sort(), [...files].sort());
});

test('each exemplar document is clean except for its declared defects', async () => {
  for (const document of manifest.documents) {
    const doc = await getDoc(document.path);
    // A clean document has a language, a title, and a noindex directive.
    if (document.cleanDocument) {
      assert.ok(doc.querySelector('html[lang]'), `${document.path} has no lang attribute`);
      assert.ok(
        doc.querySelector('title')!.text.trim(), `${document.path} has no title`
      );
      assert.ok(
        doc.querySelector('meta[name="robots"][content="noindex"]'),
        `${document.path} has no noindex directive`
      );
    }
    // The document states the purpose declared in the manifest.
    const text = doc.text.replace(/\s+/g, ' ');
    assert.ok(
      text.includes(document.purpose),
      `${document.path} does not state its declared purpose`
    );
    // The document has the declared defect set, if any.
    if (document.defectSet) {
      checkDefectSet(doc, document.defectSet);
    }
  }
});

test('iframes.html embeds defect-free iframes of the declared kinds', async () => {
  const doc = await getDoc('iframes.html');
  const document = manifest.documents.find(({path: p}: {path: string}) => p === 'iframes.html');
  for (const frame of document.frames) {
    // getElementById misses this element in node-html-parser, so find it by attribute.
    const iframe = doc.querySelectorAll('iframe')
    .find(element => element.getAttribute('id') === frame.id);
    assert.ok(iframe && iframe.tagName === 'IFRAME', `iframe ${frame.id} is missing`);
    // The frame element itself is defect-free: it has a non-empty title.
    assert.ok(iframe.getAttribute('title'), `iframe ${frame.id} has no title`);
    // If the frame is a same-origin one, its source is another exemplar file.
    if (frame.kind === 'same-origin') {
      assert.equal(iframe.getAttribute('src'), frame.src);
      const fileName = path.basename(new URL(frame.src, 'https://x').pathname);
      const exists = await fs.stat(path.join(exemplarsDir, fileName))
      .then(() => true, () => false);
      assert.ok(exists, `same-origin frame source ${frame.src} is not an exemplar file`);
    }
    // If the frame is a srcdoc one, its inline document has the declared defect set.
    else if (frame.kind === 'srcdoc') {
      const srcdoc = iframe.getAttribute('srcdoc');
      assert.ok(srcdoc, `iframe ${frame.id} has no srcdoc`);
      const inner = parse(unescape(srcdoc));
      checkDefectSet(inner, frame.defectSet);
    }
    // Otherwise, i.e. if the frame is a cross-site one, its source is on the declared host.
    else {
      const src = iframe.getAttribute('src') ?? '';
      assert.equal(src, frame.src);
      const {hostname} = new URL(src);
      assert.equal(hostname, 'jrpool.github.io');
    }
  }
});
