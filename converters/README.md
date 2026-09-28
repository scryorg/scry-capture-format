# Converters

Ready-made ways to turn something you already have into an SCF 1.0 manifest.

| Converter | Where | Input | `source.kind` |
|---|---|---|---|
| `fromSbcov(metadataJson, manifestJson?)` | `packages/scf/src/from-sbcov.ts` (exported by `@scrymore/scf`) | scry-sbcov's legacy `metadata.json` + optional `sbcov-manifest.json` | `storybook` |
| `fromSidecars(files, sourceKind?)` | `packages/scf/src/from-sidecars.ts` (exported by `@scrymore/scf`) | A folder of `<name>.png` + optional `<name>.json` sidecars (Sentry-style) | `upload` by default |
| Argos importer | `examples/argos-importer.mjs` (a script, not a package export — it also makes network calls) | A build's screenshots from Argos Visual Testing, REST API v2 | `argos` |

The first two ship inside the `@scrymore/scf` package because they're pure, dependency-free data
transforms. The Argos importer lives under `examples/` instead because it also does network I/O
(fetching the build and downloading images), which doesn't belong in a zero-dependency library
package — see `examples/argos-importer.mjs`'s module doc for the offline/online split and
`packages/scf/test/argos-importer.test.ts` for how its pure half is tested against a recorded
fixture.
