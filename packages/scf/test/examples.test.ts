import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/validate.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

describe('example bundles', () => {
  it('examples/flutter-golden validates with no errors or warnings', async () => {
    const result = await validateBundle(path.join(REPO_ROOT, 'examples/flutter-golden'));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.manifest?.source.kind).toBe('flutter-golden');
    expect(result.manifest?.source.framework).toBe('flutter');
    expect(result.manifest?.captures).toHaveLength(3);
    // Labelled as what the sample produces: a headless flutter_test render, not an emulator run (review F11).
    expect(result.manifest?.source.platform).toBe('other');
    expect(result.manifest?.defaults?.capture?.method).toBe('headless-render');
    expect(result.manifest?.defaults?.capture?.device?.name).toBe('flutter_test 390x844@3x');
  });
});
