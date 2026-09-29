import { describe, expect, it } from 'vitest';
import { checkSourceTextMember, checkStructureMember, validateBundle } from '../src/validate.js';
import { isCheckedBundleFile } from '../src/types.js';
import type { BundleFiles } from '../src/types.js';

const PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x7e, 0x9b,
]);
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const validTree = enc({ format: 'scf-tree/1', units: 'pt', root: { type: 'View' } });
const base = (captures: unknown[], extra: Record<string, unknown> = {}) => ({
  scf: '1.0',
  source: { kind: 'storybook', platform: 'web' },
  captures,
  ...extra,
});

/**
 * Ledger F60: checkStructureMember/checkSourceTextMember are the extracted per-member content
 * checks a streaming caller (e.g. the upload service's bounded ZIP reader) runs on a
 * structure/*.json or source/* member the instant it's fully inflated, before discarding the bytes
 * and handing validateBundle a {checked: true, size} stand-in instead (see BundleFileChecked).
 */
describe('checkStructureMember (ledger F60, moved from validateBundle)', () => {
  it('returns no issues for a valid, small scf-tree/1 document', () => {
    const result = checkStructureMember('structure/a.json', validTree);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('warns (not errors) between the 2 MB soft threshold and the 10 MB hard cap', () => {
    const bigButUnderHardCap = enc({ format: 'scf-tree/1', root: { type: 'View', pad: 'x'.repeat(3 * 1024 * 1024) } });
    const result = checkStructureMember('structure/a.json', bigButUnderHardCap);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(['STRUCTURE_TREE_LARGE']);
  });

  it('errors, and skips the format check entirely, over the 10 MB hard cap', () => {
    const tooBig = new Uint8Array(11 * 1024 * 1024);
    const result = checkStructureMember('structure/a.json', tooBig);
    expect(result.errors.map((e) => e.code)).toEqual(['STRUCTURE_TREE_TOO_LARGE']);
    expect(result.warnings).toEqual([]);
  });

  it('rejects a document that is not scf-tree/1 shaped', () => {
    const result = checkStructureMember('structure/a.json', enc({ not: 'a tree' }));
    expect(result.errors.map((e) => e.code)).toEqual(['STRUCTURE_FORMAT_INVALID']);
  });

  it('rejects unparseable JSON as STRUCTURE_FORMAT_INVALID rather than throwing', () => {
    const result = checkStructureMember('structure/a.json', new TextEncoder().encode('not json'));
    expect(result.errors.map((e) => e.code)).toEqual(['STRUCTURE_FORMAT_INVALID']);
  });

  it('never attaches an id — the caller (validateBundle, or a later match-up) does that', () => {
    const result = checkStructureMember('structure/a.json', enc({ not: 'a tree' }));
    expect(result.errors[0].id).toBeUndefined();
    expect(result.errors[0].path).toBe('structure/a.json');
  });
});

describe('checkSourceTextMember (ledger F60, moved from validateBundle)', () => {
  it('returns no issues for small, valid UTF-8 text when optedIn', () => {
    const result = checkSourceTextMember('source/a.txt', new TextEncoder().encode('export const x = 1;'), true);
    expect(result.errors).toEqual([]);
  });

  it('rejects binary content as SOURCE_TEXT_NOT_TEXT', () => {
    const result = checkSourceTextMember('source/a.txt', PIXEL_PNG, true);
    expect(result.errors.map((e) => e.code)).toEqual(['SOURCE_TEXT_NOT_TEXT']);
  });

  it('rejects over the 1 MB cap as SOURCE_TEXT_TOO_LARGE, without also running the binary/UTF-8 scan', () => {
    const tooBig = new Uint8Array(2 * 1024 * 1024).fill(0x61); // all-'a', would pass the text check
    const result = checkSourceTextMember('source/a.txt', tooBig, true);
    expect(result.errors.map((e) => e.code)).toEqual(['SOURCE_TEXT_TOO_LARGE']);
  });

  it('optedIn=false raises SOURCE_TEXT_NOT_OPT_IN immediately, even for otherwise-clean text', () => {
    const result = checkSourceTextMember('source/a.txt', new TextEncoder().encode('fine text'), false);
    expect(result.errors.map((e) => e.code)).toEqual(['SOURCE_TEXT_NOT_OPT_IN']);
  });

  it('optedIn=true never adds SOURCE_TEXT_NOT_OPT_IN (validateBundle\'s aggregate check is the only source of truth)', () => {
    const result = checkSourceTextMember('source/a.txt', new TextEncoder().encode('fine text'), true);
    expect(result.errors.map((e) => e.code)).not.toContain('SOURCE_TEXT_NOT_OPT_IN');
  });
});

describe('isCheckedBundleFile', () => {
  it('is true only for {checked: true, size}, never a Uint8Array or a {head, size} image entry', () => {
    expect(isCheckedBundleFile(new Uint8Array())).toBe(false);
    expect(isCheckedBundleFile({ head: PIXEL_PNG, size: 1 })).toBe(false);
    expect(isCheckedBundleFile({ checked: true, size: 1 })).toBe(true);
    expect(isCheckedBundleFile(undefined)).toBe(false);
  });
});

describe('validateBundle: {checked, size} entries for structure/source members (ledger F60)', () => {
  it('accepts a structure/*.json member supplied as {checked: true, size} and referenced by a capture', async () => {
    const files: BundleFiles = new Map([
      [
        'scf.json',
        enc(base([{ id: 'x', image: 'images/a.png', structure: { file: 'structure/a.json', origin: 'dom', format: 'scf-tree/1' } }])),
      ],
      ['images/a.png', PIXEL_PNG],
      ['structure/a.json', { checked: true, size: 250_000_000 }], // real size irrelevant — content already checked upstream
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a source/* member supplied as {checked: true, size} and referenced by a capture, opted in', async () => {
    const files: BundleFiles = new Map([
      [
        'scf.json',
        enc(base([{ id: 'x', image: 'images/a.png', sourceText: { file: 'source/a.ts' } }], { optIn: { sourceText: true } })),
      ],
      ['images/a.png', PIXEL_PNG],
      ['source/a.ts', { checked: true, size: 900_000 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('still runs the aggregate opt-in cross-check when the sourceText member is {checked, size}', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(base([{ id: 'x', image: 'images/a.png', sourceText: { file: 'source/a.ts' } }]))], // no optIn.sourceText
      ['images/a.png', PIXEL_PNG],
      ['source/a.ts', { checked: true, size: 900_000 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('SOURCE_TEXT_NOT_OPT_IN');
  });

  it.each([
    // Unreferenced structure member: the referenced-by-a-capture cross-check still fires.
    { path: 'structure/orphan.json', size: 12_345, code: 'FORBIDDEN_MEMBER' },
    // Plain JSON member outside structure/source (e.g. a sidecar): {checked, size} isn't allowed there.
    { path: 'images/a.json', size: 500, code: 'MEMBER_BYTES_REQUIRED' },
    // structure/ member that is not .json: still MEMBER_BYTES_REQUIRED, not silently allowed.
    { path: 'structure/notes.txt', size: 500, code: 'MEMBER_BYTES_REQUIRED' },
  ])('still flags {checked, size} for $path as $code', async ({ path, size, code }) => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(base([{ id: 'x', image: 'images/a.png' }]))],
      ['images/a.png', PIXEL_PNG],
      [path, { checked: true, size }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain(code);
  });

  it('still reports STRUCTURE_FILE_MISSING when the referenced path is absent altogether (not just uncheckable)', async () => {
    const files: BundleFiles = new Map([
      [
        'scf.json',
        enc(base([{ id: 'x', image: 'images/a.png', structure: { file: 'structure/missing.json', format: 'scf-tree/1' } }])),
      ],
      ['images/a.png', PIXEL_PNG],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('STRUCTURE_FILE_MISSING');
  });

  it('rejects {checked, size} for scf.json — the shape is restricted to structure/*.json and source/*', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', { checked: true, size: 500 }],
      ['images/a.png', PIXEL_PNG],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['MEMBER_BYTES_REQUIRED']);
  });

  // 'a plain JSON member outside structure/source (e.g. a sidecar)' and 'a structure/ member that is
  // not .json' are covered by the parameterized 'still flags {checked, size} for $path as $code' case above.

  it('rejects {checked, size} for an image — the images-only {head, size} shape is unchanged (F50 still holds)', async () => {
    const files: BundleFiles = new Map([
      ['scf.json', enc(base([{ id: 'x', image: 'images/a.png' }]))],
      ['images/a.png', { checked: true, size: 500 }],
    ]);
    const result = await validateBundle(files);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['MEMBER_BYTES_REQUIRED']);
  });
});
