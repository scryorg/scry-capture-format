import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// Cross-layer import by design: this is an offline test of the examples/ reference converter's
// pure function, not a package export. See examples/argos-importer.mjs for why it's split this way.
// @ts-expect-error -- plain .mjs, no type declarations
import { argosBuildToScfManifest } from '../../../examples/argos-importer.mjs';
import { validateBundle } from '../src/validate.js';
import type { ScfManifest } from '../src/types.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

describe('argos importer (offline, recorded fixture)', () => {
  it('converts a recorded Argos REST API v2 build response into a valid SCF manifest', async () => {
    const build = JSON.parse(
      await readFile(path.join(REPO_ROOT, 'examples/argos-importer.fixture.json'), 'utf8')
    );
    const manifest = argosBuildToScfManifest(build) as ScfManifest;

    expect(manifest.source.kind).toBe('argos');
    const captures = manifest.captures as Array<{ id: string; image: string }>;
    expect(captures).toHaveLength(2);
    expect(captures[0].id).toBe('components/button/primary');
    expect(captures[1].id).toBe('components/button/secondary');

    // Pair the manifest with placeholder image bytes (a real run downloads them from shot.url) and
    // confirm the shape the importer produces is spec-valid end to end, not just individually
    // plausible fields.
    const pixelPng = await readFile(path.join(REPO_ROOT, 'fixtures/valid/basic/images/button-primary.png'));
    const files = new Map<string, Uint8Array>([['scf.json', new TextEncoder().encode(JSON.stringify(manifest))]]);
    for (const capture of captures) {
      files.set(capture.image, new Uint8Array(pixelPng));
    }

    const result = await validateBundle(files);
    if (!result.ok) {
      throw new Error(`Expected the Argos-derived manifest to validate, got: ${JSON.stringify(result.errors)}`);
    }
    expect(result.ok).toBe(true);
  });
});
