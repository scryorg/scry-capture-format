import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readImageDimensions } from '../src/image-dimensions.js';

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
