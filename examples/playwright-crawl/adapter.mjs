#!/usr/bin/env node
/**
 * Reference SCF adapter: crawls a running web app with Playwright and writes one capture per page.
 *
 * Unlike Storybook, a plain web app has no built-in story index, so this adapter builds its own
 * enumeration by following same-origin links breadth-first from a start URL, up to --max-pages.
 * `source.kind` is "crawler" (registered in spec/scf-1.0.md).
 *
 * Usage:
 *   npm install playwright   # not a dependency of this repo; bring your own
 *   node adapter.mjs --url http://localhost:3000 --out .scf-out --max-pages 40
 *   npx @scrymore/scf validate .scf-out
 *
 * This script is intentionally dependency-light beyond Playwright itself, so it's easy to read
 * top to bottom and adapt to a different crawler or a different site.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = { url: null, out: '.scf-out', maxPages: 40 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--max-pages') args.maxPages = Number(argv[++i]);
  }
  if (!args.url) throw new Error('Usage: adapter.mjs --url <start-url> [--out dir] [--max-pages N]');
  return args;
}

function idForUrl(url) {
  // Ids are opaque and never sanitised — the full path + querystring is fine and stays stable
  // across runs as long as the site's URLs don't change.
  const u = new URL(url);
  return `${u.pathname}${u.search}` || '/';
}

function fileNameForUrl(url, index) {
  // The FILE NAME is ours to choose freely (it's just a storage detail); only `id` needs to be
  // stable. A simple index keeps this adapter's own bookkeeping trivial.
  return `page-${String(index).padStart(4, '0')}.png`;
}

async function crawl({ url, out, maxPages }) {
  const startUrl = new URL(url);
  const seen = new Set([startUrl.href]);
  const queue = [startUrl.href];
  const captures = [];
  const skipped = [];

  await mkdir(path.join(out, 'images'), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  let index = 0;
  while (queue.length > 0 && captures.length < maxPages) {
    const pageUrl = queue.shift();
    index++;
    try {
      const response = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 15000 });
      if (!response || !response.ok()) {
        skipped.push({ id: idForUrl(pageUrl), reason: 'error', detail: `HTTP ${response?.status() ?? 'no response'}` });
        continue;
      }

      const fileName = fileNameForUrl(pageUrl, index);
      await page.screenshot({ path: path.join(out, 'images', fileName), fullPage: true });

      captures.push({
        id: idForUrl(pageUrl),
        image: `images/${fileName}`,
        kind: 'page',
        links: { page: pageUrl },
        capture: { method: 'browser', viewport: { width: 1280, height: 800 }, scale: 1, crop: 'fullpage' },
      });

      // Enumerate more same-origin links to crawl.
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
      for (const href of hrefs) {
        try {
          const candidate = new URL(href);
          if (candidate.origin === startUrl.origin && !seen.has(candidate.href)) {
            seen.add(candidate.href);
            queue.push(candidate.href);
          }
        } catch {
          // Ignore unparseable hrefs (mailto:, javascript:, etc).
        }
      }
    } catch (err) {
      skipped.push({ id: idForUrl(pageUrl), reason: 'timeout', detail: String(err?.message ?? err) });
    }
  }

  await browser.close();

  const manifest = {
    scf: '1.0',
    source: {
      kind: 'crawler',
      platform: 'web',
      tool: { name: 'scf-example-playwright-crawl', version: '0.1.0' },
    },
    createdAt: new Date().toISOString(),
    counts: { declared: captures.length + skipped.length, captured: captures.length, skipped },
    captures,
  };

  await writeFile(path.join(out, 'scf.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${captures.length} capture(s), skipped ${skipped.length}, to ${out}/`);
}

crawl(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
