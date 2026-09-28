#!/usr/bin/env node
/**
 * Reference SCF adapter: the simplest possible case — a tool that already writes `<name>.png`
 * files (optionally with a `<name>.json` sidecar next to each one, Sentry-Snapshot-style) and has
 * no manifest of its own. This uses the package's `fromSidecars()` converter directly instead of
 * hand-rolling scf.json.
 *
 * `@scrymore/scf` is not published to npm yet (see the repo README): within this repo, import it
 * from the built package; once it's published or vendored into your own project, this becomes
 * `import { fromSidecars } from '@scrymore/scf'`.
 *
 * Usage:
 *   node ../../packages/scf/node_modules/.bin/tsc -p ../../packages/scf   # or: npm run build -w packages/scf
 *   node adapter.mjs --dir /path/to/snapshots --out .scf-out
 *   npx @scrymore/scf validate .scf-out
 */
import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fromSidecars } from '../../packages/scf/dist/index.js';

function parseArgs(argv) {
  const args = { dir: null, out: '.scf-out', sourceKind: 'upload' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') args.dir = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--source-kind') args.sourceKind = argv[++i];
  }
  if (!args.dir) throw new Error('Usage: adapter.mjs --dir <folder-of-pngs> [--out dir] [--source-kind kind]');
  return args;
}

async function readFolderAsBundleFiles(dir) {
  const files = new Map();
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue; // this example is single-level; nest your own walk if needed
    const bytes = await readFile(path.join(dir, entry.name));
    files.set(entry.name, new Uint8Array(bytes));
  }
  return files;
}

async function main({ dir, out, sourceKind }) {
  const files = await readFolderAsBundleFiles(dir);
  const manifest = fromSidecars(files, sourceKind);

  await mkdir(path.join(out, 'images'), { recursive: true });
  for (const capture of manifest.captures) {
    // fromSidecars() keeps each image at its original relative path; here every source file was
    // flat, so we re-home it under images/ to match the bundle layout in spec/scf-1.0.md.
    const destName = path.basename(capture.image);
    await copyFile(path.join(dir, capture.image), path.join(out, 'images', destName));
    capture.image = `images/${destName}`;
  }

  await writeFile(path.join(out, 'scf.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.captures.length} capture(s) to ${out}/`);
}

main(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
