import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/validate.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'fixtures');

async function listDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

// Top-level await: both lists are read once, before any describe/it registers, so it.each can
// enumerate every fixture directory that happens to exist without hardcoding the list twice.
const validNames = await listDirs(path.join(FIXTURES_ROOT, 'valid'));
const invalidNames = await listDirs(path.join(FIXTURES_ROOT, 'invalid'));

describe('conformance fixtures: valid', () => {
  it('has at least the required scenarios', () => {
    for (const required of [
      'unknown-x-key',
      'sidecar-mode',
      'legacy-sbcov-bundle',
      'structure-tree-warning',
      'id-special-chars',
      'source-text-optin',
    ]) {
      expect(validNames).toContain(required);
    }
  });

  it.each(validNames)('%s validates ok', async (name) => {
    const result = await validateBundle(path.join(FIXTURES_ROOT, 'valid', name));
    if (!result.ok) {
      throw new Error(`Expected ${name} to be valid, got errors: ${JSON.stringify(result.errors, null, 2)}`);
    }
    expect(result.ok).toBe(true);
    expect(result.manifest).not.toBeNull();
  });

  it('structure-tree-warning still warns about the oversized tree', async () => {
    const result = await validateBundle(path.join(FIXTURES_ROOT, 'valid', 'structure-tree-warning'));
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('STRUCTURE_TREE_LARGE');
  });

  it('id-special-chars keeps every id valid and gives every capture its own image', async () => {
    const result = await validateBundle(path.join(FIXTURES_ROOT, 'valid', 'id-special-chars'));
    expect(result.ok).toBe(true);
    const manifest = result.manifest!;
    expect(Array.isArray(manifest.captures)).toBe(true);
    const ids = (manifest.captures as { id: string }[]).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('conformance fixtures: invalid', () => {
  it('has at least the required scenarios', () => {
    for (const required of [
      'duplicate-ids',
      'shared-image',
      'missing-image',
      'forbidden-member',
      'counts-mismatch',
      'bad-scale',
      'unsafe-link-javascript',
      'unsafe-link-data',
      'unsafe-link-http',
      'unsafe-link-userinfo',
      'unsafe-structure-html',
      'missing-source-text',
      'oversized-image-dimensions',
      'truncated-image-header',
      'source-text-not-opt-in',
      'binary-source-text',
    ]) {
      expect(invalidNames).toContain(required);
    }
  });

  it.each(invalidNames)('%s matches expected.json', async (name) => {
    const dir = path.join(FIXTURES_ROOT, 'invalid', name);
    const expected = JSON.parse(await readFile(path.join(dir, 'expected.json'), 'utf8')) as {
      errors: string[];
      warnings?: string[];
    };
    // The bundle itself lives in bundle/, a sibling of expected.json, so expected.json (test
    // metadata, not a bundle member) is never mistaken for a FORBIDDEN_MEMBER.
    const result = await validateBundle(path.join(dir, 'bundle'));
    expect(result.ok).toBe(false);
    expect(new Set(result.errors.map((e) => e.code))).toEqual(new Set(expected.errors));
    expect(new Set(result.warnings.map((w) => w.code))).toEqual(new Set(expected.warnings ?? []));
  });
});
