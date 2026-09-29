import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validateBundle } from '../src/validate.js';

// Ledger F125 / guarantee G7: the published schema/scf-1.0.json and the validator must accept and
// reject the same manifests. Every conformance fixture runs through BOTH; a disagreement fails.

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'fixtures');

const schema = JSON.parse(await readFile(path.join(REPO_ROOT, 'schema/scf-1.0.json'), 'utf8')) as object;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

async function dirs(dir: string): Promise<string[]> {
  return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
}

/** The manifest the validator reads (sbcov-legacy bundles have no scf.json, so they are skipped). */
async function readManifest(bundleDir: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path.join(bundleDir, 'scf.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

const cases: { name: string; dir: string; expectValid: boolean }[] = [];
for (const n of await dirs(path.join(FIXTURES_ROOT, 'valid'))) {
  cases.push({ name: `valid/${n}`, dir: path.join(FIXTURES_ROOT, 'valid', n), expectValid: true });
}
for (const n of await dirs(path.join(FIXTURES_ROOT, 'invalid'))) {
  cases.push({ name: `invalid/${n}`, dir: path.join(FIXTURES_ROOT, 'invalid', n, 'bundle'), expectValid: false });
}

/** Fixtures whose failure is about bundle CONTENTS (files, sizes, counts, ids, paths) rather than
 *  manifest shape: the schema cannot see those, so a schema-valid manifest is expected there. Only
 *  fixtures listed here may be schema-valid while validator-invalid. */
const CONTENT_ONLY = new Set([
  'binary-source-text', 'counts-mismatch', 'duplicate-ids', 'forbidden-member', 'missing-image',
  'missing-source-text', 'oversized-image-dimensions', 'shared-image', 'source-text-not-opt-in',
  'truncated-image-header',
]);

describe('schema/validator parity (F125)', () => {
  it.each(cases)('$name: ajv and validator agree', async ({ name, dir, expectValid }) => {
    const manifest = await readManifest(dir);
    if (manifest === undefined) return; // legacy sbcov bundle: no scf.json to compare
    const schemaOk = validateSchema(manifest) as boolean;
    const result = await validateBundle(dir);
    if (expectValid) {
      expect(result.ok, `validator: ${JSON.stringify(result.errors)}`).toBe(true);
      expect(schemaOk, `schema: ${JSON.stringify(validateSchema.errors)}`).toBe(true);
      return;
    }
    expect(result.ok).toBe(false);
    if (CONTENT_ONLY.has(name.replace('invalid/', ''))) return; // schema may not see this defect
    // Manifest-shape defect: the schema MUST reject it too (it is the published contract).
    expect(schemaOk, `schema accepted ${name} but the validator rejected it`).toBe(false);
  });

  it('every enum fixture is rejected by BOTH with ENUM_VALUE_INVALID', async () => {
    const enumFixtures = cases.filter((c) => /invalid\/bad-(capture|default|source|skip|structure)-/.test(c.name));
    expect(enumFixtures.length).toBeGreaterThanOrEqual(10);
    for (const c of enumFixtures) {
      const manifest = await readManifest(c.dir);
      expect(validateSchema(manifest), c.name).toBe(false);
      const result = await validateBundle(c.dir);
      expect(result.errors.map((e) => e.code), c.name).toContain('ENUM_VALUE_INVALID');
    }
  });
});
