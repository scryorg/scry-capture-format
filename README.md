# Scry Capture Format (SCF)

A public, versioned bundle format so any tool — Storybook, a native app preview, an E2E crawler, a
visual-testing service — can feed [Scry](https://scrymore.com) with UI screenshots and metadata,
without Scry writing a bespoke integration for each one. **An adapter is anything that writes an SCF
bundle.**

- **Spec:** [`spec/scf-1.0.md`](spec/scf-1.0.md) — read this first.
- **Writing an adapter?** Start at [`AGENTS.md`](AGENTS.md) (written for a coding agent, but fine
  for a human too).
- **JSON Schema:** [`schema/scf-1.0.json`](schema/scf-1.0.json), [`schema/scf-tree-1.json`](schema/scf-tree-1.json)
  (JSON Schema 2020-12, `x-stability` on every field).
- **Validator:** [`packages/scf`](packages/scf) — the `@scrymore/scf` package (TypeScript, ESM, zero
  runtime dependencies) and its `scf validate <dir|zip>` CLI. **Not published to npm yet** — see
  "Status" below.
- **Conformance fixtures:** [`fixtures/`](fixtures) — valid and invalid bundles with expected
  validator output, run in CI against every commit.
- **Reference adapters and converters:** [`examples/`](examples), [`converters/`](converters).

## Programmatic API

Besides the CLI, `@scrymore/scf` exports `validateBundle(input: BundleFiles | string)` for any
service that already has a bundle in memory (a Worker or Node process that just read a ZIP or a
directory) rather than on disk as something the CLI can point at. `BundleFiles` is
`Map<string, BundleFileBytes>` — bundle-relative POSIX path to bytes.

`BundleFileBytes` is `Uint8Array | { head: Uint8Array; size: number } | { checked: true; size: number }`.
Every member MUST be a full `Uint8Array` **except** an image (a capture's `image` field) and a
`structure/*.json` or `source/*` member:

- An **image** may instead be supplied as `{ head, size }` — just the first bytes of the file (enough
  for magic-byte family detection and a header-only PNG/JPEG/WebP dimension read — 64 KiB is generous)
  plus its real total `size`. Every image check (`IMAGE_FORMAT_INVALID`, `IMAGE_TOO_LARGE`,
  `IMAGE_DIMENSION_TOO_LARGE`, `IMAGE_HEADER_UNREADABLE`) behaves identically either way. Two small
  helpers normalize either shape: `bundleFileHead(entry)` (bytes for header inspection) and
  `bundleFileSize(entry)` (the real total byte length).
- A **`structure/*.json` or `source/*` member** may instead be supplied as `{ checked: true, size }`
  once its full bytes have already been run through the package's exported `checkStructureMember(path,
  bytes)` / `checkSourceTextMember(path, bytes, optedIn)` — the same content checks `validateBundle`
  would otherwise apply inline (size caps, `scf-tree/1` shape, UTF-8/binary sniffing) — and the caller
  has recorded whatever issues that produced. `validateBundle` then trusts that and only performs its
  cross-checks (does the member exist, is it referenced by a capture, is `optIn.sourceText` set) rather
  than re-reading content it no longer has. `isCheckedBundleFile(entry)` tells the two shapes apart.
  Any other member given either partial shape (a non-image as `{head, size}`, or anything outside
  `structure/*.json`/`source/*` as `{checked, size}`) is rejected with `MEMBER_BYTES_REQUIRED`.

Used by `scry-storybook-upload-service`'s bundle-upload route (a genuinely streaming ZIP reader,
ledger F31/F32/F60) and `scry-build-processing-service`'s own two-pass streaming read.

## Status

Pre-1.0-publish. This repo is currently **private** and the package is **not published to npm**.
Until both flip (alongside `scry-sbcov` going public — the reference web adapter), Scry's own
services vendor `@scrymore/scf`'s built `dist/` into `src/vendor/scf/`, pinned to a commit sha, per
the capture-sources feature's contract. Once published, an adapter author just runs
`npx @scrymore/scf validate`.

## Layout

```
spec/          the SCF 1.0 spec + changelog
schema/        JSON Schema 2020-12 for the manifest and the scf-tree/1 structure format
packages/scf/  the @scrymore/scf package: validator, converters, CLI
fixtures/      conformance fixtures (valid/ and invalid/, the latter with expected.json)
examples/      reference adapters and converters (Playwright, folder-of-PNGs, Compose, Argos)
converters/    a pointer to where each converter lives and why
AGENTS.md      how to write a Scry adapter, for a coding agent
```

## Developing

```
npm install
npm run typecheck --workspace packages/scf
npm run build --workspace packages/scf
npm run test --workspace packages/scf
```

Node >= 20.19 or >= 22.12 (the test toolchain's requirement; the published package itself only
requires Node >= 20 or a Worker runtime).

## License

MIT — see [`LICENSE`](LICENSE). Applies to the spec text, the schemas, the package, and everything
else in this repo.
