import { describe, expect, it } from 'vitest';
import { isSafeRelPath, validateBundle } from '../src/validate.js';
import type { BundleFiles } from '../src/types.js';

const PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x7e, 0x9b,
]);
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const manifest = (image: string) => ({
  scf: '1.0',
  source: { kind: 'storybook', platform: 'web' },
  captures: [{ id: 'x', image }],
});

describe('bundle path safety (ledger F27)', () => {
  it.each(['/etc/evil.png', '../evil.png', 'images/../../evil.png', 'images/./a.png', 'images//a.png', 'images\\a.png', 'C:/a.png', ''])(
    'rejects %j',
    (p) => expect(isSafeRelPath(p)).toBe(false)
  );

  it.each(['images/a.png', 'structure/a.tree.json', 'images/sub dir/a:b#c.png'])('accepts %j', (p) =>
    expect(isSafeRelPath(p)).toBe(true)
  );

  it('rejects a capture whose image points outside the bundle', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest('../../../../etc/evil.png'))],
      ['images/a.png', PIXEL_PNG],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('UNSAFE_PATH');
  });

  it('rejects a bundle containing a member with a traversal path', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(manifest('images/a.png'))],
      ['images/a.png', PIXEL_PNG],
      ['images/../../evil.png', PIXEL_PNG],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('UNSAFE_PATH');
  });
});

describe('{head, size} entries are images only (ledger F50)', () => {
  const partial = (bytes: Uint8Array, size: number) => ({ head: bytes, size });
  const base = (captures: unknown[], extra: Record<string, unknown> = {}) => ({
    scf: '1.0',
    source: { kind: 'storybook', platform: 'web' },
    captures,
    ...extra,
  });

  it('rejects a partial scf.json', async () => {
    const files: BundleFiles = new Map<string, any>([
      ['scf.json', partial(enc(base([{ id: 'x', image: 'images/a.png' }])), 10_000_000)],
      ['images/a.png', PIXEL_PNG],
    ]);
    const r = await validateBundle(files);
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('MEMBER_BYTES_REQUIRED');
  });

  it('rejects a partial structure tree and a partial source text', async () => {
    const tree = enc({ format: 'scf-tree/1', units: 'pt', root: { type: 'View' } });
    const files: BundleFiles = new Map<string, any>([
      ['scf.json', enc(base([{ id: 'x', image: 'images/a.png', structure: { file: 'structure/a.json', origin: 'dom', format: 'scf-tree/1' } }]))],
      ['images/a.png', PIXEL_PNG],
      ['structure/a.json', partial(tree, 50_000_000)],
      ['source/a.txt', partial(new TextEncoder().encode('ok'), 50_000_000)],
    ]);
    const r = await validateBundle(files);
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['MEMBER_BYTES_REQUIRED', 'MEMBER_BYTES_REQUIRED']);
  });

  it('a partial entry with an image extension used as sourceText is treated as missing, not validated from its head', async () => {
    const files: BundleFiles = new Map<string, any>([
      ['scf.json', enc(base([{ id: 'x', image: 'images/a.png', sourceText: { file: 'source/a.png' } }], { optIn: { sourceText: true } }))],
      ['images/a.png', PIXEL_PNG],
      ['source/a.png', partial(PIXEL_PNG, 50_000_000)],
    ]);
    const r = await validateBundle(files);
    expect(r.ok).toBe(false);
  });

  it('still accepts a partial image', async () => {
    const files: BundleFiles = new Map<string, any>([
      ['scf.json', enc(base([{ id: 'x', image: 'images/a.png' }]))],
      ['images/a.png', partial(PIXEL_PNG, 1234)],
    ]);
    const r = await validateBundle(files);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
