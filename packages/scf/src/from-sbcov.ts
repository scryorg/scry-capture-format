import type { CaptureBlock, ScfCapture, ScfManifest, SkipReason } from './types.js';

/** A metadata.json entry as written by scry-sbcov's zip-generator (no `storyId` field). */
interface SbcovMetadataEntry {
  storyId?: string;
  filepath: string;
  componentFilePath?: string;
  componentName?: string;
  testName?: string;
  storyTitle?: string;
  screenshotPath: string;
  location?: { startLine: number; endLine: number };
  capture?: {
    mode: 'viewport' | 'root';
    viewport?: { width: number; height: number };
    dpr?: number;
    scale?: number;
    imageSize?: { width: number; height: number };
  };
  commitSha?: string;
  branch?: string;
  repository?: string;
}

interface SbcovDropped {
  storyId?: string;
  reason?: string;
  detail?: string;
}

interface SbcovManifest {
  sbcovVersion?: string;
  declared?: number;
  captured?: number;
  dropped?: SbcovDropped[];
}

const KNOWN_SKIP_REASONS = new Set<SkipReason>(['error', 'timeout', 'filtered', 'unsupported', 'empty']);

function mapSkipReason(raw?: string): SkipReason {
  return raw && KNOWN_SKIP_REASONS.has(raw as SkipReason) ? (raw as SkipReason) : 'error';
}

const ID_SANITIZE_RE = /[ ,'’()!@#$%^&*+=<>{}[\]|\\;:/?.]+/g;

/** Mirrors Storybook's `toId(kind, name)` closely enough to reproduce the same identity that the
 *  dashboard's suggest feature already derives from `storyTitle` + `testName` when no `storyId`
 *  field is present in metadata.json (the normal case — see search-api-client.ts:208-228). This id
 *  is for capture identity only; the legacy storage key stays `basename(screenshotPath)` (contract §3,
 *  guarantee G1), so byte-identical web rows do not depend on this function. */
export function toStorybookId(title: string, name: string): string {
  const sanitize = (value: string) =>
    value
      .toLowerCase()
      .replace(ID_SANITIZE_RE, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  const kind = sanitize(title || 'unknown');
  const leaf = name ? sanitize(name) : '';
  return leaf ? `${kind}--${leaf}` : kind;
}

/**
 * Converts a legacy sbcov `metadata.json` (+ optional `sbcov-manifest.json`) into an SCF 1.0
 * manifest, per spec/scf-1.0.md "Compatibility". `links.live` is left null here: sbcov's
 * metadata.json has no build URL, so the caller (build processing) fills it from the build's
 * Storybook view URL.
 */
export function fromSbcov(metadataJson: unknown, manifestJson?: unknown): ScfManifest {
  const entries: SbcovMetadataEntry[] = Array.isArray(metadataJson)
    ? (metadataJson as SbcovMetadataEntry[])
    : ((metadataJson as { stories?: SbcovMetadataEntry[] } | undefined)?.stories ?? []);

  const manifest = manifestJson as SbcovManifest | undefined;
  const withRepo = entries.find((e) => e.repository);

  const captures: ScfCapture[] = entries.map((entry) => {
    const id = entry.storyId ?? toStorybookId(entry.storyTitle ?? '', entry.testName ?? '');
    const capture: CaptureBlock | undefined = entry.capture
      ? {
          method: 'browser',
          viewport: entry.capture.viewport,
          scale: entry.capture.scale ?? entry.capture.dpr,
          size: entry.capture.imageSize,
          crop: entry.capture.mode === 'root' ? 'root' : 'viewport',
        }
      : undefined;

    const capObj: ScfCapture = {
      id,
      image: entry.screenshotPath,
      kind: 'component',
      name: entry.testName,
      code: {
        file: entry.filepath,
        line: entry.location?.startLine,
        componentFile: entry.componentFilePath || undefined,
      },
      links: { live: null },
      tags: [],
      'x-sbcov': { storyId: entry.storyId ?? null },
    };
    if (entry.storyTitle) capObj.title = entry.storyTitle.split('/');
    if (capture) capObj.capture = capture;
    return capObj;
  });

  const dropped = manifest?.dropped ?? [];

  const result: ScfManifest = {
    scf: '1.0',
    source: { kind: 'storybook', platform: 'web', tool: { name: 'scry-sbcov', version: manifest?.sbcovVersion } },
    counts: {
      declared: manifest?.declared ?? captures.length + dropped.length,
      captured: manifest?.captured ?? captures.length,
      skipped: dropped.map((d) => ({
        id: d.storyId ?? '(unknown)',
        reason: mapSkipReason(d.reason),
        detail: d.detail ?? d.reason,
      })),
    },
    captures,
  };
  if (withRepo?.repository) {
    result.repository = { url: withRepo.repository, commit: withRepo.commitSha, branch: withRepo.branch };
  }
  return result;
}
