import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/validate.js';
import { isMeasuredBundleFile } from '../src/types.js';
import type { BundleFiles } from '../src/types.js';

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const manifest = {
  scf: '1.0',
  source: { kind: 'storybook', platform: 'web' },
  captures: [{ id: 'x', image: 'images/a.png' }],
};

/**
 * Ledger F69: F32/F60's fixes left the image member category exposed to the exact same "keep it all
 * in memory" problem — an 8,000-entry bundle of honest, individually-tiny images could retain ~500 MB
 * via the `{head, size}` shape (F31/F32), since a `{head, size}` entry whose real content is under the
 * head cap retains the WHOLE image, forever, with no aggregate cap of its own. A streaming caller can
 * instead run `measureImage` (image-dimensions.ts) against a bounded prefix of an image's real bytes,
 * discard them entirely, and hand `validateBundle` a `{measured: true, family, width, height, size}`
 * record — no bytes at all, just a small fixed-size record — which `validateBundle` must apply the
 * exact same magic/size/dimension rules to as it would a full image.
 */
describe('BundleFiles image entries as {measured, family, width, height, size} (ledger F69)', () => {
  it('validates a {measured} image exactly like the equivalent full image, using no bytes at all', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { measured: true, family: 'png', width: 1, height: 1, size: 4096 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects IMAGE_TOO_LARGE from the reported `size`, even though no bytes were ever supplied', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { measured: true, family: 'png', width: 1, height: 1, size: 21 * 1024 * 1024 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('IMAGE_TOO_LARGE');
  });

  it('rejects IMAGE_FORMAT_INVALID when family disagrees with the extension', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { measured: true, family: 'jpeg', width: 10, height: 10, size: 4096 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('IMAGE_FORMAT_INVALID');
  });

  it('rejects IMAGE_FORMAT_INVALID when family is null (measureImage could not identify or measure it)', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { measured: true, family: null, width: 0, height: 0, size: 4096 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('IMAGE_FORMAT_INVALID');
  });

  it('rejects IMAGE_DIMENSION_TOO_LARGE from the reported dimensions', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { measured: true, family: 'png', width: 20000, height: 10, size: 4096 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('IMAGE_DIMENSION_TOO_LARGE');
  });

  it('rejects {measured} for a non-image member — the shape is restricted to images, same as {head, size} (F50/F69)', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', { measured: true, family: 'png', width: 1, height: 1, size: 500 }],
      ['images/a.png', { measured: true, family: 'png', width: 1, height: 1, size: 4096 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('MEMBER_BYTES_REQUIRED');
  });

  it('still flags an unreferenced {measured} image as FORBIDDEN_MEMBER', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc({ ...manifest, captures: [] })],
      ['images/a.png', { measured: true, family: 'png', width: 1, height: 1, size: 4096 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('FORBIDDEN_MEMBER');
  });

  describe('isMeasuredBundleFile', () => {
    it('is true only for {measured: true, ...}, never a Uint8Array, {head, size}, or {checked, size}', () => {
      expect(isMeasuredBundleFile(new Uint8Array())).toBe(false);
      expect(isMeasuredBundleFile({ head: new Uint8Array(), size: 1 })).toBe(false);
      expect(isMeasuredBundleFile({ checked: true, size: 1 })).toBe(false);
      expect(isMeasuredBundleFile({ measured: true, family: 'png', width: 1, height: 1, size: 1 })).toBe(true);
      expect(isMeasuredBundleFile(undefined)).toBe(false);
    });
  });
});
