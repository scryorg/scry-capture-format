import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromSbcov, toStorybookId } from '../src/from-sbcov.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'fixtures/valid/legacy-sbcov-bundle');
const NO_STORYID_FIXTURE_DIR = path.join(REPO_ROOT, 'fixtures/valid/legacy-sbcov-bundle-no-storyid');

async function loadFixture(dir: string) {
  const metadataJson = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8'));
  const manifestJson = JSON.parse(await readFile(path.join(dir, 'sbcov-manifest.json'), 'utf8'));
  return { metadataJson, manifestJson };
}

/**
 * Golden test: the fixture's metadata.json / sbcov-manifest.json follow the exact field list
 * written by scry-sbcov's zip-generator.ts (`MetadataEntry`: storyId, filepath, componentFilePath,
 * componentName, testName, storyTitle, screenshotPath, location?, capture?, commitSha?, branch?,
 * repository?). `storyId` is a required, always-populated field on current sbcov output (confirmed
 * against scry-sbcov origin/main zip-generator.ts:12-21/196-197) — an earlier note here, and ledger
 * F19, wrongly said sbcov never writes one. No R2 credentials were available in this session to pull
 * a live stage build.json, so this is built from that field list rather than a captured production
 * bundle (per the PR 0 brief's documented fallback).
 */
describe('fromSbcov (golden, current sbcov shape — storyId present)', () => {
  it('converts the fixture metadata.json + sbcov-manifest.json into an SCF 1.0 manifest', async () => {
    const { metadataJson, manifestJson } = await loadFixture(FIXTURE_DIR);

    const manifest = fromSbcov(metadataJson, manifestJson);

    expect(manifest.scf).toBe('1.0');
    expect(manifest.source).toEqual({
      kind: 'storybook',
      platform: 'web',
      tool: { name: 'scry-sbcov', version: '0.7.0' },
    });
    expect(manifest.repository).toEqual({
      url: 'https://github.com/acme/kettle',
      commit: '4f1c2e9abc',
      branch: 'main',
    });
    expect(manifest.counts).toEqual({
      declared: 3,
      captured: 2,
      skipped: [{ id: 'components-map--default', reason: 'timeout', detail: 'no render after 10s' }],
    });

    expect(Array.isArray(manifest.captures)).toBe(true);
    const captures = manifest.captures as Array<Record<string, unknown>>;
    expect(captures).toHaveLength(2);

    // storyId is present in this fixture (current sbcov shape): id = entry.storyId, not derived.
    expect(captures[0]).toMatchObject({
      id: 'components-button--primary',
      image: 'images/button-primary.png',
      kind: 'component',
      title: ['Components', 'Button'],
      name: 'Primary',
      code: { file: 'src/components/Button.stories.tsx', line: 12, componentFile: 'src/components/Button.tsx' },
      capture: { method: 'browser', viewport: { width: 1280, height: 720 }, scale: 2, crop: 'root' },
    });
    expect(captures[1]).toMatchObject({
      id: 'components-button--secondary',
      image: 'images/button-secondary.png',
      name: 'Secondary',
    });

    // links (so links.live) is absent: metadata.json carries no build URL, so build processing (not
    // fromSbcov) fills links.live in from the build's Storybook view URL. See spec "Compatibility".
    expect(captures[0].links).toBeUndefined();

    // No fallback happened, so no sbcov.id_derived warning.
    expect(manifest.warnings).toBeUndefined();
  });

  it('falls back to declared = captured + skipped.length when no manifest is given', () => {
    const manifest = fromSbcov([
      {
        storyId: 'a--default',
        filepath: 'a.tsx',
        screenshotPath: 'images/a.png',
        storyTitle: 'A',
        testName: 'Default',
      },
    ]);
    expect(manifest.counts).toEqual({ declared: 1, captured: 1, skipped: [] });
  });

  it('uses storyId as-is when present, instead of deriving one', () => {
    const manifest = fromSbcov([
      {
        storyId: 'custom-id-value',
        filepath: 'a.tsx',
        screenshotPath: 'images/a.png',
        storyTitle: 'Components/Button',
        testName: 'Primary',
      },
    ]);
    const captures = manifest.captures as Array<{ id: string }>;
    // storyTitle/testName would derive "components-button--primary" if storyId were ignored.
    expect(captures[0].id).toBe('custom-id-value');
    expect(manifest.warnings).toBeUndefined();
  });

  it('accepts the snake_case story_id spelling when storyId is absent', () => {
    const manifest = fromSbcov([
      {
        story_id: 'snake-case-id',
        filepath: 'a.tsx',
        screenshotPath: 'images/a.png',
        storyTitle: 'Components/Button',
        testName: 'Primary',
      },
    ]);
    const captures = manifest.captures as Array<{ id: string }>;
    expect(captures[0].id).toBe('snake-case-id');
    expect(manifest.warnings).toBeUndefined();
  });

  it('treats a blank storyId as absent and derives instead, warning sbcov.id_derived', () => {
    const manifest = fromSbcov([
      { storyId: '', filepath: 'a.tsx', screenshotPath: 'images/a.png', storyTitle: 'Components/Button', testName: 'Primary' },
    ]);
    const captures = manifest.captures as Array<{ id: string }>;
    expect(captures[0].id).toBe('components-button--primary');
    expect(manifest.warnings).toEqual([expect.objectContaining({ code: 'sbcov.id_derived' })]);
  });
});

/**
 * Golden test: the same MetadataEntry field list as above, but as written by an sbcov version that
 * predates `storyId` (ledger F19's original, now-corrected scenario). Exercises the fallback path end
 * to end, including the `sbcov.id_derived` warning naming how many entries fell back.
 */
describe('fromSbcov (golden, older sbcov shape — storyId absent)', () => {
  it('derives ids from storyTitle + testName and reports one sbcov.id_derived warning for both', async () => {
    const { metadataJson, manifestJson } = await loadFixture(NO_STORYID_FIXTURE_DIR);

    const manifest = fromSbcov(metadataJson, manifestJson);
    const captures = manifest.captures as Array<Record<string, unknown>>;

    expect(captures).toHaveLength(2);
    expect(captures[0]).toMatchObject({ id: 'components-button--primary', name: 'Primary' });
    expect(captures[1]).toMatchObject({ id: 'components-button--secondary', name: 'Secondary' });
    expect(captures[0].links).toBeUndefined();

    // One warning naming the count of fallbacks (not one per entry).
    expect(manifest.warnings).toHaveLength(1);
    expect(manifest.warnings?.[0]).toMatchObject({ code: 'sbcov.id_derived' });
    expect(manifest.warnings?.[0].message).toContain('2 of 2');
  });
});

describe('toStorybookId', () => {
  it('joins sanitised title and name with "--"', () => {
    expect(toStorybookId('Components/Button', 'Primary')).toBe('components-button--primary');
  });

  it('collapses punctuation runs and trims edges', () => {
    expect(toStorybookId('Components/Button', '')).toBe('components-button');
    expect(toStorybookId('  Nested / Group  ', 'Empty cart!')).toBe('nested-group--empty-cart');
  });
});
