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
  });
});
