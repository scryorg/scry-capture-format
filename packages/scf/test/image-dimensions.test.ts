import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectImageFamily, measureImage, readImageDimensions } from '../src/image-dimensions.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');

describe('readImageDimensions (header-only, no decode — ledger F25)', () => {
  it('reads PNG width/height from IHDR', async () => {
    const bytes = await readFile(path.join(REPO_ROOT, 'fixtures/valid/basic/images/button-primary.png'));
    expect(readImageDimensions(new Uint8Array(bytes), 'png')).toEqual({ width: 1, height: 1 });
  });

  it('returns null for a truncated PNG (no IHDR data)', async () => {
    const bytes = await readFile(
      path.join(REPO_ROOT, 'fixtures/invalid/truncated-image-header/bundle/images/a.png')
    );
    expect(readImageDimensions(new Uint8Array(bytes), 'png')).toBeNull();
  });

  it('reads the oversized fixture PNG as over the 16384px bound', async () => {
    const bytes = await readFile(
      path.join(REPO_ROOT, 'fixtures/invalid/oversized-image-dimensions/bundle/images/huge.png')
    );
    const dims = readImageDimensions(new Uint8Array(bytes), 'png');
    expect(dims).not.toBeNull();
    expect(dims!.width).toBeGreaterThan(16384);
  });

  it('reads JPEG width/height from the SOF0 marker', () => {
    // A minimal real JPEG (SOI, APP0/JFIF, DQT, SOF0 100x50, ... ) — only the SOI..SOF0 prefix
    // matters for this parser; it returns as soon as it sees the first SOF marker.
    const jpeg = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x32, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00, // SOF0: precision 8, height 0x0032=50, width 0x0064=100
    ]);
    expect(readImageDimensions(jpeg, 'jpeg')).toEqual({ width: 100, height: 50 });
  });

  it('reads WebP VP8 (lossy) dimensions from a real libwebp/Pillow-encoded file', async () => {
    // Real files (generated via Pillow, a 37x51 canvas), not hand-crafted bytes — WebP's bit-packed
    // headers are easy to get subtly wrong by hand; this is the ground truth.
    const bytes = await readFile(path.join(HERE, 'fixtures/sample-lossy.webp'));
    expect(readImageDimensions(new Uint8Array(bytes), 'webp')).toEqual({ width: 37, height: 51 });
  });

  it('reads WebP VP8L (lossless) dimensions from a real libwebp/Pillow-encoded file', async () => {
    const bytes = await readFile(path.join(HERE, 'fixtures/sample-lossless.webp'));
    expect(readImageDimensions(new Uint8Array(bytes), 'webp')).toEqual({ width: 37, height: 51 });
  });

  it('returns null for an animated/extended WebP shape it does not parse', () => {
    const vp8x = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x41, 0x4e, 0x4d, 0x46, 0x00, 0x00, 0x00, 0x00, // an "ANMF" chunk, not VP8/VP8L/VP8X
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(readImageDimensions(vp8x, 'webp')).toBeNull();
  });
});

/**
 * Ledger F69: `measureImage` is the single call a memory-bounded streaming reader needs — magic-byte
 * family detection plus a header-only dimension read, combined, so the caller never needs to touch
 * `detectImageFamily`/`readImageDimensions` separately just to build a `{measured}` record. It's a
 * pure function of whatever prefix you hand it (see its own doc comment for why calling it again as
 * more of a bounded prefix arrives is always safe).
 */
describe('measureImage (ledger F69: magic-byte family + header-only dimensions, combined)', () => {
  it('measures a real PNG from its own bytes as the prefix', async () => {
    const bytes = await readFile(path.join(REPO_ROOT, 'fixtures/valid/basic/images/button-primary.png'));
    expect(measureImage(new Uint8Array(bytes))).toEqual({ family: 'png', width: 1, height: 1 });
  });

  it('measures a real JPEG from a prefix well under the 64 KiB recommended cap', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x32, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00, // SOF0: 100x50
    ]);
    expect(measureImage(jpeg)).toEqual({ family: 'jpeg', width: 100, height: 50 });
  });

  it('measures a real WebP (VP8, lossy) from its own bytes as the prefix', async () => {
    const bytes = await readFile(path.join(HERE, 'fixtures/sample-lossy.webp'));
    expect(measureImage(new Uint8Array(bytes))).toEqual({ family: 'webp', width: 37, height: 51 });
  });

  it('returns null when the prefix does not match any known image family', () => {
    expect(measureImage(new TextEncoder().encode('<html>not an image</html>'))).toBeNull();
  });

  it('returns null (not a partial answer) when the family is known but the prefix is too short for dimensions', () => {
    // Only the PNG signature — not the full 24 bytes IHDR needs. detectImageFamily alone would say
    // 'png', but measureImage collapses "family known, dims unreadable" into the same null a
    // completely-unrecognised prefix would give, since a caller holding only a bounded prefix has no
    // way to act differently on the two cases anyway (see its own doc comment).
    const truncated = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageFamily(truncated)).toBe('png'); // family IS identifiable this early
    expect(measureImage(truncated)).toBeNull(); // but measureImage still says null overall
  });

  it('returns null for a JPEG whose SOF marker never shows up within the given prefix (fails closed, ledger F69)', () => {
    // SOI + a huge APP1/EXIF-shaped segment with no SOF ever following, simulating a real photo
    // whose embedded thumbnail pushes SOF past whatever bounded prefix a streaming caller buffered.
    const bigApp1Length = 60000; // segment length field includes itself; way under 64 KiB total
    const jpeg = new Uint8Array(2 + 4 + bigApp1Length - 2);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8; // SOI
    jpeg[2] = 0xff;
    jpeg[3] = 0xe1; // APP1
    jpeg[4] = (bigApp1Length >> 8) & 0xff;
    jpeg[5] = bigApp1Length & 0xff;
    // No SOF marker anywhere after this — the segment just runs to the end of the buffer.
    expect(measureImage(jpeg)).toBeNull();
  });
});
