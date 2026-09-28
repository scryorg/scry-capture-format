import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/validate.js';
import type { BundleFiles } from '../src/types.js';

// A complete (not truncated) 1x1 PNG, so these tests exercise link safety only — the image-header
// checks (IMAGE_HEADER_UNREADABLE / IMAGE_DIMENSION_TOO_LARGE, see F25) get their own fixtures.
const PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x7e, 0x9b,
]);

function bundleWithLink(field: 'live' | 'page', url: string): BundleFiles {
  const manifest = {
    scf: '1.0',
    source: { kind: 'storybook', platform: 'web' },
    captures: [{ id: 'x', image: 'images/a.png', links: { [field]: url } }],
  };
  return new Map<string, Uint8Array>([
    ['scf.json', new TextEncoder().encode(JSON.stringify(manifest))],
    ['images/a.png', PIXEL_PNG],
  ]);
}

describe('links.live / links.page safety (security review finding #1, ledger F18)', () => {
  it.each([
    ['javascript:alert(1)', 'links.live.not_https'],
    ['data:text/html,<script>alert(1)</script>', 'links.live.not_https'],
    ['http://example.com/iframe.html', 'links.live.not_https'],
    ['https://user:pw@example.com/iframe.html', 'links.live.not_https'],
    ['not a url', 'links.live.not_https'],
    ['https://' + 'a'.repeat(2050) + '.com', 'links.live.not_https'],
  ])('rejects links.live = %s', async (url, code) => {
    const result = await validateBundle(bundleWithLink('live', url));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain(code);
  });

  it('rejects the same unsafe shapes on links.page', async () => {
    const result = await validateBundle(bundleWithLink('page', 'javascript:alert(1)'));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('links.page.not_https');
  });

  it('accepts a plain https: URL with no credentials', async () => {
    const result = await validateBundle(bundleWithLink('live', 'https://view.scrymore.com/acme/main/iframe.html'));
    expect(result.ok).toBe(true);
  });

  it('accepts links.live being absent or explicitly null', async () => {
    const manifestNull = {
      scf: '1.0',
      source: { kind: 'storybook', platform: 'web' },
      captures: [{ id: 'x', image: 'images/a.png', links: { live: null } }],
    };
    const files = new Map<string, Uint8Array>([
      ['scf.json', new TextEncoder().encode(JSON.stringify(manifestNull))],
      ['images/a.png', PIXEL_PNG],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(true);
  });
});
