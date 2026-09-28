import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { storageKey, sourceKeyOf } from '../src/storage-key.js';
import type { ScfManifest } from '../src/types.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

describe('storageKey', () => {
  it('matches contract §3: {projectId}/{buildId}/c/{sha256_hex(sourceKey+"\\n"+id).slice(0,32)}.{ext}', () => {
    const key = storageKey('proj-1', 'build-9', 'storybook:web', 'Components/Button--Primary', 'png');
    expect(key).toMatch(/^proj-1\/build-9\/c\/[0-9a-f]{32}\.png$/);
  });

  it('strips a leading dot from ext', () => {
    const key = storageKey('p', 'b', 'storybook:web', 'x', '.png');
    expect(key.endsWith('.png')).toBe(true);
    expect(key.includes('..')).toBe(false);
  });

  it('is deterministic: same inputs -> same key', () => {
    const a = storageKey('p', 'b', 'storybook:web', 'Components/Button--Primary', 'png');
    const b = storageKey('p', 'b', 'storybook:web', 'Components/Button--Primary', 'png');
    expect(a).toBe(b);
  });

  it('gives ids that differ only in punctuation distinct keys (no sanitising collision)', () => {
    const ids = [
      'Login/Default',
      'login-default',
      'pkg.Button#Preview',
      'pkg.Button-Preview',
      'com.x.ButtonKt:Preview',
      'Checkout flow/step 3',
    ];
    const keys = ids.map((id) => storageKey('proj-1', 'build-1', 'storybook:web', id, 'png'));
    expect(new Set(keys).size).toBe(ids.length);
  });

  it('every id in the id-special-chars fixture gets a distinct storage key', async () => {
    const manifestPath = path.join(REPO_ROOT, 'fixtures/valid/id-special-chars/scf.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ScfManifest;
    const sourceKey = sourceKeyOf(manifest);
    const captures = manifest.captures as Array<{ id: string }>;
    const keys = captures.map((c) => storageKey('proj-1', 'build-1', sourceKey, c.id, 'png'));
    expect(new Set(keys).size).toBe(captures.length);
  });

  it('a different sourceKey changes the hash even for the same id (keeps platforms apart)', () => {
    const web = storageKey('p', 'b', 'storybook:web', 'Button--Primary', 'png');
    const ios = storageKey('p', 'b', 'storybook-rn:ios', 'Button--Primary', 'png');
    expect(web).not.toBe(ios);
  });
});

describe('sourceKeyOf', () => {
  it('is "<kind>:<platform>"', () => {
    expect(sourceKeyOf({ source: { kind: 'storybook-rn', platform: 'ios' } })).toBe('storybook-rn:ios');
  });

  it('defaults platform to "web" when absent', () => {
    expect(sourceKeyOf({ source: { kind: 'storybook' } })).toBe('storybook:web');
  });
});
