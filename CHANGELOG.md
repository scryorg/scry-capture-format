# Changelog

All notable changes to the Scry Capture Format spec, schemas and the `@scrymore/scf` package are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-09-28

Initial public release, promoted from the 2026-09-27 founder-reviewed draft
(`scry-management/features/capture-sources/spec/scry-capture-format-v1-draft.md`).

### Fixed since the draft (contradictions)

- **Bundle layout excluded files it requires.** The draft's "Bundle layout" section and forbidden-member rule said
  a bundle "MUST contain nothing except `scf.json`, image files and optional `*.json` sidecars," but the capture
  object explicitly supports `structure.file` (e.g. `structure/button-primary.json`) and `sourceText.file`
  (e.g. `source/button-primary.src.txt`) pointing at bundle members outside `images/`. A validator built strictly
  from the stated rule would reject any bundle that used `structure` or `sourceText`. Fixed: the bundle layout and
  the forbidden-member rule now explicitly allow `structure/…` and `source/…`, in addition to `scf.json`, images,
  and sidecars — and forbid any other member, referenced or not.
- **`kind` was missing from the explicit stable-field list.** The Stability section marked two *values* of `kind`
  (`region`, `doc-image`) as experimental without ever classifying the `kind` field itself, which is used
  everywhere (dashboard grouping, search). Fixed: `kind` is now listed explicitly under "Stable in 1.0."

### Added

- A "Validator error and warning codes" appendix so the spec, the JSON Schema `x-stability` annotations and the
  `@scrymore/scf` package agree on one vocabulary (used by conformance fixtures' `expected.json`).
- An explicit relationship note: `counts.declared` SHOULD equal `counts.captured + counts.skipped.length` when all
  three are present.
- **Security (review finding #1, ledger F18):** `links.live` and `links.page` are adapter-controlled URLs
  set on every capture by any CI job holding the project's API key — a far wider surface than today's single
  admin-configured Storybook URL, and `links.live` is auto-embedded as an iframe wherever Storybook is
  embedded today. The validator now rejects either field unless it is an absolute `https:` URL with no
  userinfo/credentials and at most 2048 characters (`links.live.not_https` / `links.page.not_https`), with
  fixtures for `javascript:`, `data:`, plain `http:`, and `https://user:pw@…`. `links.live`'s spec row is
  revised accordingly: a reader MUST NOT embed it unless its origin is one already trusted for that project.
  This closes the PR 0 portion of F18; PR 5 (dashboard) and PR 8 (scry-link) still need to reuse the existing
  sandboxed embed component and check the URL's origin before treating it as trusted.

### Unchanged

- Everything else keeps the structure and wording of the 2026-09-27 draft: the design rules, the manifest and
  capture object field tables, `scf-tree/1`, id stability rules, and the compatibility section for sbcov,
  Sentry-style folders and Argos.

[1.0.0]: https://github.com/scryorg/scry-capture-format/releases/tag/v0.1.0
