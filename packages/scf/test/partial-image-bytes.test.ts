import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/validate.js';
import { bundleFileHead, bundleFileSize } from '../src/types.js';
import type { BundleFiles } from '../src/types.js';

// A real (if tiny) 1x1 PNG, so `detectImageFamily` + `readImageDimensions` both succeed against
// just its header bytes.
const PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x7e, 0x9b,
]);
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const manifest = {
  scf: '1.0',
  source: { kind: 'storybook', platform: 'web' },
  captures: [{ id: 'x', image: 'images/a.png' }],
};

/**
 * Ledger F31/F32: a caller that streams a large bundle rather than buffering it whole (e.g. the
 * upload service's bounded-zip reader) can supply an image as `{head, size}` instead of the full
 * decoded bytes. The validator must treat that identically to a full Uint8Array for every check
 * that only needs the header (magic bytes, dimensions) or the real size (the 20 MB cap) — and must
 * never need, or ask for, the image's true full content.
 */
describe('BundleFiles image entries as {head, size} (ledger F31/F32)', () => {
  it('validates a {head, size} image exactly like the equivalent full Uint8Array', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { head: PIXEL_PNG, size: PIXEL_PNG.byteLength }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects IMAGE_TOO_LARGE from the reported `size`, even though only a small head is present', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { head: PIXEL_PNG, size: 21 * 1024 * 1024 }], // over the 20 MB cap
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('IMAGE_TOO_LARGE');
  });

  it('still content-sniffs a {head, size} entry (IMAGE_FORMAT_INVALID on a mismatched magic number)', async () => {
    const notAnImage = new TextEncoder().encode('<html>not an image</html>');
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { head: notAnImage, size: notAnImage.byteLength }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('IMAGE_FORMAT_INVALID');
  });

  it('fails closed (IMAGE_HEADER_UNREADABLE) when only a truncated head is available and a real header never fit', async () => {
    // A real 1x1 PNG's IHDR fits in far fewer than 64 KiB, but a pathological producer could hand
    // back a head shorter than the header it needs — the validator must not crash or "guess".
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest)],
      ['images/a.png', { head: PIXEL_PNG.subarray(0, 10), size: PIXEL_PNG.byteLength }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('IMAGE_HEADER_UNREADABLE');
  });

  describe('bundleFileHead / bundleFileSize', () => {
    it('treats a plain Uint8Array as its own head, with size === byteLength', () => {
      expect(bundleFileHead(PIXEL_PNG)).toBe(PIXEL_PNG);
      expect(bundleFileSize(PIXEL_PNG)).toBe(PIXEL_PNG.byteLength);
    });

    it('unwraps a {head, size} entry to its head and its reported size', () => {
      const partial = { head: PIXEL_PNG, size: 123456 };
      expect(bundleFileHead(partial)).toBe(PIXEL_PNG);
      expect(bundleFileSize(partial)).toBe(123456);
    });

    it('returns undefined for undefined (a missing bundle member)', () => {
      expect(bundleFileHead(undefined)).toBeUndefined();
      expect(bundleFileSize(undefined)).toBeUndefined();
    });
  });
});
