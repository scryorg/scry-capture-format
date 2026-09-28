# How to write a Scry adapter

You are a coding agent. Someone has asked you to make their tool feed Scry (a UI-mapping product) by writing
an **SCF adapter**: a script that writes a **Scry Capture Format (SCF) 1.0** bundle. This document is
self-contained — you should not need anything else to do the job.

## What you're building

An adapter is any program that:
1. Produces one screenshot per "thing worth mapping" (a component state, a screen, a page) from your tool.
2. Writes those images plus a `scf.json` manifest describing them, per `spec/scf-1.0.md` in this repo.
3. Runs `npx @scrymore/scf validate <output-dir>` and fixes anything it reports before handing the bundle
   to Scry (or to whatever uploads it — this repo does not do the uploading).

You do **not** need to understand Scry's product, its APIs, or its database. You only need to produce a
directory that the validator accepts. Read `spec/scf-1.0.md` in full before starting — it's short.

## The bundle, in one paragraph

A directory (or a `.zip` of one) with `scf.json` at the root and image files under `images/` (any
sub-folders). Each entry in `scf.json`'s `captures` array needs an `id` (any unique string — never sanitise
it) and an `image` (the path to its PNG/JPEG/WebP, relative to the bundle root). Everything else is optional
but makes the result more useful. Nothing in the bundle may be anything other than `scf.json`, images,
optional structure/source-text files referenced from a capture, or JSON sidecars.

## Steps

1. **Find the enumeration point.** However your tool already lists "the things to render" — Storybook's
   `index.json`, a test runner's list of specs, a directory of preview functions, a design tool's node
   list — that list becomes your loop. If your tool can already produce one screenshot per item with *some*
   stable name, you are most of the way there.
2. **Pick ids that will survive a rename.** The id is how Scry recognises "the same thing" across builds so
   that a Figma link, an issue, or history doesn't silently break. Prefer identifiers your tool already
   treats as stable (a story id, a fully-qualified class/function name, a route path) over anything derived
   from a title string that a human might edit. See "Id stability" in the spec.
3. **Capture the image.** Use whatever your tool already uses to take a screenshot. Record the actual pixel
   scale you captured at in `capture.scale` — Scry needs this to line the image up with a Figma frame that's
   in points/dp, not pixels. If you can crop to just the component/screen (rather than a full window with
   chrome around it), do that and set `capture.crop: "root"`; otherwise use `"viewport"` or `"fullpage"`.
4. **Write `scf.json`.** Fill `source.kind` (use a registered value from the spec's table, or `x-<yourtool>`
   if none fits), `source.platform`, and `source.tool` with your adapter's own name and version. Put
   whatever is common to every capture (device, scale, method) in `defaults.capture` instead of repeating it.
5. **Be honest about counts.** Set `counts.declared` to how many things you *meant* to capture and
   `counts.captured` to how many are actually in the bundle. For every one you skipped, add an entry to
   `counts.skipped` with a reason. Scry has been burned before by tools that silently drop failures — don't
   be another one.
6. **Emit a structure tree only if it's easy.** If your tool already has the rendered layout tree in hand
   (a DOM, a React Native fiber tree, a semantics tree, an accessibility tree), write it as `scf-tree/1`
   (spec section "scf-tree/1") and point `capture.structure` at it. If extracting one would mean adding a
   new dependency or walking an API you don't already use, skip it — it's optional and experimental.
7. **Never include source code by default.** `sourceText` exists but is opt-in only. If your adapter has a
   flag for it (e.g. `--include-source`), only populate `sourceText` when the user passes that flag, and say
   so in your output ("Source text included for N captures because --include-source was set.").
8. **Validate before you're done.** Run:
   ```
   npx @scrymore/scf validate <output-dir>
   ```
   Fix every error it prints (each one names the capture id or the file path). Warnings don't block upload
   but are worth a look. Exit code 0 means the bundle is ready.
9. **Hand off the directory (or zip it).** What happens next — uploading it to Scry — is outside this repo's
   scope; whatever calls your adapter should already know how, or ask the person who asked for the adapter.

## Checklist (re-check before you say you're done)

- [ ] Ids are stable across two runs of your adapter against the same input (run it twice; diff the ids).
- [ ] Ids are never sanitised, slugified, or otherwise transformed by your adapter — write them exactly as
      your tool names the thing. Scry derives storage keys itself by hashing.
- [ ] `counts.declared` and `counts.captured` are both set, and every gap between them has a `skipped` entry
      with a real reason (not a placeholder).
- [ ] `capture.scale` is set to the true pixel-per-point/CSS-px ratio you captured at, not assumed to be 1.
- [ ] `capture.crop` reflects what you actually captured (`root` vs `viewport` vs `fullpage`) — don't guess.
- [ ] A `structure` tree is included if your tool already had one available without extra work; otherwise
      it's fine to leave out entirely.
- [ ] `sourceText` is empty/absent unless the user explicitly opted in, and your adapter prints a notice
      when it is included.
- [ ] `npx @scrymore/scf validate <output-dir>` exits 0 with no errors.
- [ ] The bundle contains nothing but `scf.json`, images, and (if used) `structure/`, `source/`, or sidecar
      JSON files. No `.html`, `.js`, or archives — even a test fixture or a log file will be rejected.

## Reference adapters

Three short, real scripts to copy from, in `examples/`:

| File | What it shows |
|---|---|
| `examples/playwright-crawl/adapter.mjs` | Crawling a running web app with Playwright and writing one capture per page (a `crawler`-kind adapter with no story index to read from — you build the enumeration yourself). |
| `examples/folder-of-pngs/adapter.mjs` | The simplest possible adapter: a tool that already writes `<name>.png` files with no manifest of its own, converted to SCF with the package's `fromSidecars()` (or written directly if you don't have Node). |
| `examples/compose-preview/ComposePreviewScfWriter.kt` | Illustrative only (not built or run in this repo) — shows the same manifest shape written from a JVM test that has already rendered `@Preview` composables to bitmaps, for teams that can't shell out to Node from their test runner. |

Also see `converters/` for two worked conversions from formats you may already have: `fromSbcov` (this
package, for sbcov's own legacy `metadata.json`) and `examples/argos-importer.mjs` (a script, not a package
export, for pulling snapshots out of an Argos Visual Testing build via its REST API v2).

## If you get stuck

Re-read `spec/scf-1.0.md`'s "Validator error and warning codes" table — every error the validator can print
is listed there with what triggers it. If validation passes but Scry still rejects the bundle, that's a bug
in Scry, not in your adapter (see guarantee G7 in the feature plan: a bundle the public validator accepts is
always accepted server-side).
