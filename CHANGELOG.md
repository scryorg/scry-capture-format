# Changelog

All notable changes to the Scry Capture Format spec, schemas and the `@scrymore/scf` package are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-09-28

- `{head, size}` entries are accepted for images only; any other member given partially is rejected with `MEMBER_BYTES_REQUIRED`, and JSON, structure trees and source text are always read from full bytes (`bundleFileFull`) (security review F50).

- Validator rejects unsafe bundle paths (absolute, backslash, drive letters, empty, `.` or `..` segments) for members and for every path a capture references: error `UNSAFE_PATH` (security review F27).
- `BundleFiles` image entries may now be supplied as `{head, size}` instead of full bytes — the first bytes of
  the file (enough for magic-byte family detection and a header-only dimension read) plus the image's real
  total size. Every other check (`IMAGE_FORMAT_INVALID`, `IMAGE_TOO_LARGE`, `IMAGE_DIMENSION_TOO_LARGE`,
  `IMAGE_HEADER_UNREADABLE`) behaves identically to a full `Uint8Array`. Added so a caller that streams a
  large bundle rather than buffering it whole (security review F31/F32: a Cloudflare Worker's ~128 MB isolate
  can't hold a fully-inflated multi-hundred-MB bundle) never has to materialize a full decoded image just to
  validate it. New exports `BundleFileBytes`, `bundleFileHead`, `bundleFileSize`. Every non-image member
  (`scf.json`, `structure.file`/`sourceText.file`, sidecar JSON) must still be supplied in full.

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
- **Security (review finding #2, ledger F24):** `structure.file` and `sourceText.file` were being added to the
  member allow-list purely because a capture referenced them, with no check on their own shape — pointing
  `structure.file` at an arbitrary `.html`/`.js` payload was a working bypass of the bundle's forbidden-member
  rule (G6). Fixed: `structure.file` MUST now be a `.json` path under `structure/` that parses as a `scf-tree/1`
  document (`STRUCTURE_PATH_INVALID`, `STRUCTURE_FORMAT_INVALID`), with a 10 MB hard cap
  (`STRUCTURE_TREE_TOO_LARGE`) alongside the existing 2 MB warning. `sourceText.file` MUST be a path under
  `source/`, MUST exist (previously unchecked), MUST be valid UTF-8 text with no NUL bytes or recognised binary
  magic number (`SOURCE_TEXT_NOT_TEXT`), and is capped at 1 MB (`SOURCE_TEXT_TOO_LARGE`). The manifest MUST also
  set the new `optIn.sourceText: true` field whenever any capture sets `sourceText` (`SOURCE_TEXT_NOT_OPT_IN`) —
  the validator otherwise has no way to distinguish an intentional inclusion from source text left over in a
  re-packaged bundle. Any path failing these checks is *not* allow-listed, so if the file exists at all it is
  also flagged `FORBIDDEN_MEMBER`.
- **Security (review finding #3, ledger F25):** the spec promises images are "at most 16384 px on the longest
  side," but only byte size (20 MB) and the magic-byte family were ever checked — a small, well-compressed file
  can still declare an enormous canvas, a resource-exhaustion risk for whatever decodes it downstream
  (thumbnailing, pixel diff). Fixed: a new dependency-free `readImageDimensions()` reads width/height straight
  from the PNG IHDR chunk, the JPEG SOF marker, or the WebP VP8/VP8L/VP8X header (no image decode). Over the
  limit is `IMAGE_DIMENSION_TOO_LARGE`; a header this parser can't read (truncated file, or an
  animated/exotic WebP shape) fails closed as `IMAGE_HEADER_UNREADABLE` rather than being silently accepted.

- **Fixed (PR 0 review, ledger F19):** `fromSbcov()` treated sbcov's `storyId` field as though it never existed
  and always derived `id` from `storyTitle` + `testName` — wrong: scry-sbcov's zip-generator has always written a
  required, non-empty `storyId` on every `metadata.json` entry. Fixed: `id` = `storyId` (or the snake_case
  `story_id`) whenever it's a non-empty string, falling back to the derived id only for bundles from sbcov
  versions that predate the field, with a new `sbcov.id_derived` warning on the returned manifest naming how many
  entries fell back. Also: `links.live` is now left absent (not `null`) in `fromSbcov()`'s output, matching the
  spec's "Compatibility" wording that the converter itself doesn't know the build's Storybook URL. Two golden
  fixtures now cover both metadata.json shapes (`legacy-sbcov-bundle` with `storyId`, `legacy-sbcov-bundle-no-storyid`
  without it).

### Unchanged

- Everything else keeps the structure and wording of the 2026-09-27 draft: the design rules, the manifest and
  capture object field tables, `scf-tree/1`, id stability rules, and the compatibility section for sbcov,
  Sentry-style folders and Argos.

[1.0.0]: https://github.com/scryorg/scry-capture-format/releases/tag/v0.1.0
