import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureImageRecord, MEASURE_IMAGE_MAX_PREFIX_BYTES } from '../src/image-dimensions.js';
import { validateBundle } from '../src/validate.js';
import type { BundleFiles } from '../src/types.js';

// Ledger F126 / G7: a streaming reader (upload route, build processing) hands validateBundle
// {measured, ...} records instead of bytes. Every fixture must produce the SAME error codes AND
// messages through that path as through the plain directory path (what the CLI uses).

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'fixtures');

async function walk(root: string, rel = '', out: string[] = []): Promise<string[]> {
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(root, r, out);
    else out.push(r);
  }
  return out;
}

async function asStreamed(dir: string): Promise<BundleFiles> {
  const files: BundleFiles = new Map();
  for (const rel of await walk(dir)) {
    const bytes = new Uint8Array(await readFile(path.join(dir, rel)));
    const isImage = /\.(png|jpe?g|webp)$/i.test(rel);
    files.set(rel, isImage ? measureImageRecord(bytes.subarray(0, MEASURE_IMAGE_MAX_PREFIX_BYTES), bytes.length) : bytes);
  }
  return files;
}

const bundles: { name: string; dir: string }[] = [];
for (const kind of ['valid', 'invalid'] as const) {
  for (const e of await readdir(path.join(FIXTURES_ROOT, kind), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(FIXTURES_ROOT, kind, e.name, kind === 'invalid' ? 'bundle' : '');
    bundles.push({ name: `${kind}/${e.name}`, dir });
  }
}

describe('streamed {measured} path matches the directory path (F126)', () => {
  it.each(bundles)('$name: same codes and messages', async ({ dir }) => {
    const direct = await validateBundle(dir);
    const streamed = await validateBundle(await asStreamed(dir));
    const key = (r: typeof direct) => r.errors.map((e) => `${e.code}|${e.message}`).sort();
    expect(key(streamed)).toEqual(key(direct));
    expect(streamed.ok).toBe(direct.ok);
  });

  it('truncated-image-header is IMAGE_HEADER_UNREADABLE on the streamed path', async () => {
    const dir = path.join(FIXTURES_ROOT, 'invalid', 'truncated-image-header', 'bundle');
    const r = await validateBundle(await asStreamed(dir));
    expect(r.errors.map((e) => e.code)).toEqual(['IMAGE_HEADER_UNREADABLE']);
    expect(r.errors[0]!.message).toContain('Could not read image dimensions from the header');
  });
});
