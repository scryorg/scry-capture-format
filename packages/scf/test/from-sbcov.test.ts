import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromSbcov, toStorybookId } from '../src/from-sbcov.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'fixtures/valid/legacy-sbcov-bundle');

/**
 * Golden test: the fixture's metadata.json / sbcov-manifest.json follow the exact field list
 * written by scry-sbcov's zip-generator.ts (MetadataEntry: filepath, componentFilePath,
 * componentName, testName, storyTitle, screenshotPath, location?, capture?; no `storyId` field —
 * real sbcov output has never included one). No R2 credentials were available in this session to
 * pull a live stage build.json, so this is built from that field list rather than a captured
 * production bundle (per the PR 0 brief's documented fallback).
 */
describe('fromSbcov (golden)', () => {
  it('converts the fixture metadata.json + sbcov-manifest.json into an SCF 1.0 manifest', async () => {
    const metadataJson = JSON.parse(await readFile(path.join(FIXTURE_DIR, 'metadata.json'), 'utf8'));
    const manifestJson = JSON.parse(await readFile(path.join(FIXTURE_DIR, 'sbcov-manifest.json'), 'utf8'));

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

    // No storyId field in real sbcov metadata.json: id is derived the same way the dashboard's
    // suggest feature already derives it (Storybook's toId over storyTitle + testName).
    expect(captures[0]).toMatchObject({
      id: 'components-button--primary',
      image: 'images/button-primary.png',
      kind: 'component',
      title: ['Components', 'Button'],
      name: 'Primary',
      code: { file: 'src/components/Button.stories.tsx', line: 12, componentFile: 'src/components/Button.tsx' },
      capture: { method: 'browser', viewport: { width: 1280, height: 720 }, scale: 2, crop: 'root' },
      links: { live: null },
    });
    expect(captures[1]).toMatchObject({
      id: 'components-button--secondary',
      image: 'images/button-secondary.png',
      name: 'Secondary',
    });

    // links.live is left null: metadata.json carries no build URL, so build processing (not
    // fromSbcov) fills it from the build's Storybook view URL. See spec "Compatibility".
    expect((captures[0] as { links: { live: unknown } }).links.live).toBeNull();
  });

  it('falls back to declared = captured + skipped.length when no manifest is given', () => {
    const manifest = fromSbcov([
      { filepath: 'a.tsx', screenshotPath: 'images/a.png', storyTitle: 'A', testName: 'Default' },
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
