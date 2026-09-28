import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readZip } from '../src/zip.js';
import { validateBundle } from '../src/validate.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));

// basic.zip is `fixtures/valid/basic` zipped with the system `zip` command (committed as a binary
// fixture so tests don't depend on `zip` being installed on the CI runner).
describe('readZip', () => {
  it('reads a real ZIP (built with the system zip tool) into a bundle files map', async () => {
    const buf = await readFile(path.join(HERE, 'fixtures/basic.zip'));
    const files = readZip(buf);

    expect(files.has('scf.json')).toBe(true);
    expect(files.has('images/button-primary.png')).toBe(true);
    expect(files.has('images/button-secondary.png')).toBe(true);
    // Directory entries (zero-length "images/") must not appear as files.
    expect(files.has('images/')).toBe(false);
  });

  it('the unzipped bundle validates ok, same as the directory it was zipped from', async () => {
    const buf = await readFile(path.join(HERE, 'fixtures/basic.zip'));
    const files = readZip(buf);
    const result = await validateBundle(files);
    expect(result.ok).toBe(true);
  });
});
