#!/usr/bin/env node
/**
 * Reference converter: imports a build's screenshots from Argos Visual Testing (REST API v2) into
 * an SCF 1.0 manifest. `source.kind` is "argos" (registered in spec/scf-1.0.md).
 *
 * This script has two parts, deliberately kept separate:
 *   - `argosBuildToScfManifest(build)` is a pure function: Argos API JSON in, SCF manifest out. It
 *     does no network or filesystem I/O, so it is unit-tested offline against a recorded fixture
 *     (argos-importer.fixture.json, next to this file) — see packages/scf/test/argos-importer.test.ts.
 *     No live Argos account or token was available when this was written; the fixture's shape
 *     follows Argos's published REST API v2 docs, not a captured real response.
 *   - `main()` does the actual network calls: reads ARGOS_TOKEN from the environment, fetches a
 *     build's screenshot list, downloads each image, and writes the bundle. This half is not
 *     covered by the offline test.
 *
 * Usage:
 *   ARGOS_TOKEN=... node argos-importer.mjs --owner acme --repo kettle --build 42 --out .scf-out
 *   npx @scrymore/scf validate .scf-out
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ARGOS_API_BASE = 'https://api.argos-ci.com/v2';

/**
 * Pure: an Argos build + screenshot list (REST API v2 shape) -> an SCF 1.0 manifest. No I/O.
 * Each capture's `image` is the LOCAL path main() will write the downloaded bytes to; this
 * function never touches the network, so it can be tested with a canned `build` object.
 */
export function argosBuildToScfManifest(build) {
  const screenshots = build.screenshots ?? [];

  const captures = screenshots.map((shot, index) => {
    const ext = (shot.url?.split('.').pop() || 'png').toLowerCase();
    const localName = `${String(index).padStart(4, '0')}.${ext === 'jpg' || ext === 'jpeg' ? 'jpg' : 'png'}`;
    const parts = (shot.name ?? '').split('/');

    return {
      id: shot.name ?? shot.id ?? `screenshot-${index}`,
      image: `images/${localName}`,
      kind: 'screen',
      title: parts.length > 1 ? parts.slice(0, -1) : undefined,
      name: parts[parts.length - 1] || undefined,
      capture: {
        method: 'browser',
        viewport: shot.viewport ? { width: shot.viewport.width, height: shot.viewport.height } : undefined,
        size: shot.width && shot.height ? { width: shot.width, height: shot.height } : undefined,
        scale: 1,
        crop: 'fullpage',
      },
      'x-argos': { screenshotId: shot.id ?? null, buildId: build.build?.id ?? null },
    };
  });

  return {
    scf: '1.0',
    source: { kind: 'argos', platform: 'web', tool: { name: 'scf-example-argos-importer', version: '0.1.0' } },
    counts: { declared: captures.length, captured: captures.length, skipped: [] },
    captures,
  };
}

// ---- everything below here talks to the network; not exercised by the offline test ----

function parseArgs(argv) {
  const args = { owner: null, repo: null, build: null, out: '.scf-out' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--owner') args.owner = argv[++i];
    else if (argv[i] === '--repo') args.repo = argv[++i];
    else if (argv[i] === '--build') args.build = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  if (!args.owner || !args.repo || !args.build) {
    throw new Error('Usage: argos-importer.mjs --owner <org> --repo <repo> --build <number> [--out dir]');
  }
  return args;
}

async function fetchArgosBuild({ owner, repo, build }) {
  const token = process.env.ARGOS_TOKEN;
  if (!token) throw new Error('Set ARGOS_TOKEN in the environment (an Argos API token) — never hardcode it.');

  const res = await fetch(`${ARGOS_API_BASE}/repositories/${owner}/${repo}/builds/${build}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Argos API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const build = await fetchArgosBuild(args);
  const manifest = argosBuildToScfManifest(build);

  await mkdir(path.join(args.out, 'images'), { recursive: true });
  const screenshots = build.screenshots ?? [];
  for (let i = 0; i < screenshots.length; i++) {
    const shot = screenshots[i];
    const capture = manifest.captures[i];
    const res = await fetch(shot.url);
    if (!res.ok) {
      console.warn(`Skipping ${capture.id}: could not download ${shot.url} (HTTP ${res.status})`);
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    await writeFile(path.join(args.out, capture.image), bytes);
  }

  await writeFile(path.join(args.out, 'scf.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.captures.length} capture(s) to ${args.out}/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
