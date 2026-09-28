import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/validate.js';
import type { BundleFiles } from '../src/types.js';

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

/**
 * Ledger F69 / spec MUSTs: an explicit bundle-wide member-count cap (20,000) and capture-count cap
 * (10,000), independent of any per-image memory bound — a bundle is bounded regardless of how many
 * members or captures it declares, not just how large any one image is. `validateBundle` is the
 * shared gate (contract guarantee G7) so it enforces both itself, even though a streaming ZIP reader
 * (scry-storybook-upload-service's `readBoundedZip`) also enforces the member cap earlier, before
 * inflating anything.
 */
describe('bundle-wide entry-count caps (ledger F69)', () => {
  it('accepts a bundle right at the member-count cap boundary (not over it)', async () => {
    // Exactly 20,000 members: scf.json + 19,999 images. Deliberately unreferenced (no capture points
    // at them), so this exercises only the member-count cap in isolation — FORBIDDEN_MEMBER errors
    // are expected and irrelevant here, and unreferenced images keep this independent of the capture
    // cap. Uses {measured} entries so this test itself stays fast and light: proving the cap is about
    // count, not about real bytes.
    const files: BundleFiles = new Map<string, any>();
    for (let i = 0; i < 19_999; i++) {
      files.set(`images/${i}.png`, { measured: true, family: 'png', width: 1, height: 1, size: 100 });
    }
    files.set('scf.json', enc({ scf: '1.0', source: { kind: 'storybook', platform: 'web' }, captures: [] }));
    expect(files.size).toBe(20_000);
    const result = await validateBundle(files);
    expect(result.errors.map((e) => e.code)).not.toContain('BUNDLE_TOO_MANY_MEMBERS');
  });

  it('rejects BUNDLE_TOO_MANY_MEMBERS over the 20,000-member cap, without processing anything else', async () => {
    const files: BundleFiles = new Map<string, any>();
    for (let i = 0; i < 20_001; i++) {
      files.set(`images/${i}.png`, { measured: true, family: 'png', width: 1, height: 1, size: 100 });
    }
    // Deliberately no scf.json at all — if the member-count cap fired first (as it must), the
    // otherwise-inevitable SCF_JSON_MISSING never gets a chance to run.
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['BUNDLE_TOO_MANY_MEMBERS']);
  });

  it('rejects BUNDLE_TOO_MANY_CAPTURES over the 10,000-capture cap', async () => {
    const captures = Array.from({ length: 10_001 }, (_, i) => ({ id: `x${i}`, image: 'images/a.png' }));
    const files: BundleFiles = new Map<string, any>([
      ['scf.json', enc({ scf: '1.0', source: { kind: 'storybook', platform: 'web' }, captures })],
      ['images/a.png', { measured: true, family: 'png', width: 1, height: 1, size: 100 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('BUNDLE_TOO_MANY_CAPTURES');
  });

  it('accepts exactly 10,000 captures (at the cap, not over it)', async () => {
    const captures = Array.from({ length: 10_000 }, (_, i) => ({ id: `x${i}`, image: 'images/a.png' }));
    const files: BundleFiles = new Map<string, any>([
      [
        'scf.json',
        enc({
          scf: '1.0',
          source: { kind: 'storybook', platform: 'web' },
          captures,
        }),
      ],
      ['images/a.png', { measured: true, family: 'png', width: 1, height: 1, size: 100 }],
    ]);
    const result = await validateBundle(files);
    expect(result.errors.map((e) => e.code)).not.toContain('BUNDLE_TOO_MANY_CAPTURES');
  });
});
