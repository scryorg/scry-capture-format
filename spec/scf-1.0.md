# Scry Capture Format (SCF) 1.0

Status: **final** (promoted from the 2026-09-27 draft; see `CHANGELOG.md`). The words MUST, SHOULD and MAY are
used as in RFC 2119.

## Why it exists

Scry maps UI across design, code and the running product. Any tool that can produce screenshots can feed it:
Storybook, native previews, E2E tests, crawlers, visual-testing services, docs sites. Instead of Scry writing an
integration for every tool, SCF is the one thing Scry accepts. **An adapter is anything that writes an SCF bundle.**
A team can ask its coding agent "write a Scry adapter for &lt;our tool&gt;" and point it at this document and the
validator (see `AGENTS.md`).

Design rules:
1. **Small required core.** A valid bundle needs a manifest, image files and, per capture, an `id` and an `image`.
   Everything else is optional and makes the map richer.
2. **Ids are opaque.** Any string, unique within the bundle. Adapters never sanitise or encode ids; Scry derives
   storage keys itself. (This ends the sbcov sanitiser coupling and the collisions it causes.)
3. **Honest counts.** A bundle says how many captures it meant to make and why any are missing. Silent drops are
   the failure mode Scry has been bitten by most.
4. **Forward compatible.** Readers ignore unknown fields. Vendor data goes under `x-<vendor>` keys and is preserved.
5. **Stability is labelled.** Every field is **stable** (only changes in a major version) or **experimental** (may
   change in a minor version; readers must tolerate its absence). Labels are in the Stab. column below, and in the
   JSON Schema as `x-stability`.
6. **Tool-neutral wording.** Nothing in the format assumes Scry's internals, so another tool could read or write
   SCF unchanged. The name can move to a neutral home later if others adopt it.

## Bundle layout

A directory, or a `.zip` of that directory:

```
scf.json            the manifest (required, at the root)
images/…            image files, any sub-folders (required)
structure/…          optional scf-tree/1 files, referenced by a capture's structure.file
source/…             optional source-text files, referenced by a capture's sourceText.file (opt-in only)
```

- Images MUST be PNG, JPEG or WebP, at most 20 MB each and 16384 px on the longest side.
- A bundle MUST contain nothing except `scf.json`, files referenced by a capture's `image`, `structure.file` or
  `sourceText.file`, and optional `*.json` sidecars (below). Scry rejects HTML, JS, binaries and archives inside
  the bundle, and any file no capture points to, whatever its extension (guarantee G6).
- Sidecar mode (for tools that already write one JSON file per image, such as Sentry-style folders): `scf.json` MAY
  omit `captures` and set `"captures": "sidecars"`. Each `images/x.png` then has an optional `images/x.json` holding
  one capture object (its `image` defaults to the neighbouring file; its `id` defaults to the path without extension).

## scf.json

```json
{
  "$schema": "https://scrymore.com/schemas/scf/1.0.json",
  "scf": "1.0",
  "source": {
    "kind": "storybook-rn",
    "platform": "ios",
    "framework": "react-native",
    "tool": { "name": "@scrymore/scry-deployer capture rn", "version": "0.10.0" }
  },
  "repository": { "url": "https://github.com/acme/kettle", "commit": "4f1c2e9…", "branch": "main" },
  "createdAt": "2026-09-27T14:01:00Z",
  "defaults": {
    "capture": { "method": "simulator", "device": { "name": "iPhone 16", "os": "iOS 26.0" }, "scale": 3 }
  },
  "counts": {
    "declared": 21,
    "captured": 20,
    "skipped": [ { "id": "Components/Map--Default", "reason": "timeout", "detail": "no render after 10 s" } ]
  },
  "captures": [ { "…": "capture objects, below" } ]
}
```

| Field | Req. | Meaning |
|---|---|---|
| `scf` | MUST | Spec version, `"1.0"`. Scry accepts the current and the previous minor version. |
| `source.kind` | MUST | What produced the captures. Registered values: `storybook`, `storybook-rn`, `compose-preview`, `swiftui-preview`, `uikit`, `widgetbook`, `flutter-golden`, `playwright`, `cypress`, `maestro`, `xcuitest`, `crawler`, `figma`, `argos`, `percy`, `docs`, `upload`. Anything else MUST be written as `x-<name>`. |
| `source.platform` | SHOULD | `web`, `ios`, `android`, `macos`, `windows`, `email`, `other`. |
| `source.framework` | MAY | `react`, `vue`, `react-native`, `compose`, `swiftui`, `flutter`, … |
| `source.tool` | SHOULD | Name and version of the adapter. Shown on the dashboard, used when debugging a rejection. |
| `repository` | MAY | Where the code lives; enables "open source file" links. |
| `defaults` | MAY | Any capture field; applied to every capture that does not set it. Keeps bundles small. |
| `counts.declared` | SHOULD | How many captures the adapter meant to make. |
| `counts.captured` | SHOULD | How many are in the bundle. MUST equal `captures.length` when both are present (and captures is an array, not `"sidecars"`). |
| `counts.skipped[]` | SHOULD | One entry per missing capture: `id`, `reason` (`error`, `timeout`, `filtered`, `unsupported`, `empty`), `detail`. `declared` SHOULD equal `captured + skipped.length` when all three are present. |
| `captures` | MUST | Array of capture objects, or `"sidecars"`. |

## Stability

Stable in 1.0: `scf`, `source.kind`, `source.platform`, `source.tool`, `repository`, `defaults`, `counts.*`,
`captures`; per capture `id`, `image`, `kind`, `title`, `name`, `code.*`, `variant`, `capture.method`, `capture.device`,
`capture.viewport`, `capture.scale`, `capture.size`, `capture.crop`, `links.live`, `links.page`, `tags`, `x-*`.

Experimental in 1.0: `kind` values `region` and `doc-image`, `links.figma`, `flow`, `structure`, `sourceText`,
sidecar mode.

## Capture object

```json
{
  "id": "Components/Button--Primary",
  "image": "images/button-primary.png",
  "kind": "component",
  "title": ["Components", "Button"],
  "name": "Primary",
  "code": {
    "file": "src/components/Button.stories.tsx",
    "line": 12,
    "component": "Button",
    "componentFile": "src/components/Button.tsx"
  },
  "variant": { "theme": "light", "locale": "en-US", "fontScale": 1, "args": { "label": "Add to order" } },
  "capture": {
    "method": "simulator",
    "device": { "name": "iPhone 16", "os": "iOS 26.0" },
    "scale": 3,
    "size": { "width": 1179, "height": 2556 },
    "crop": "root"
  },
  "links": {
    "live": null,
    "page": null,
    "figma": "https://www.figma.com/design/okiw…?node-id=12-345"
  },
  "flow": null,
  "structure": { "file": "structure/button-primary.json", "origin": "rn-fiber", "format": "scf-tree/1" },
  "sourceText": null,
  "tags": ["button", "cta"],
  "x-acme": { "owner": "checkout-team" }
}
```

| Field | Req. | Meaning |
|---|---|---|
| `id` | MUST | Stable identity of *this thing* across builds: the same component state gets the same id next build. Any non-empty string up to 512 chars, unique in the bundle. Good ids: Storybook story ids, `com.acme.ButtonKt.PrimaryPreview`, `Checkout.swift:PrimaryButton`, `checkout-flow/step-3`, a URL path plus viewport. |
| `image` | MUST | Path of the image inside the bundle. Two captures MUST NOT share an image. |
| `kind` | SHOULD | `component`, `screen`, `page`, `flow-step`, `region`, `doc-image`. Default `component`. |
| `title` | SHOULD | Hierarchy as an array (`["Components","Button"]`) or a `/`-separated string. Drives grouping and search. |
| `name` | SHOULD | Leaf name of the state or variant ("Primary", "Empty cart"). |
| `code.file`, `code.line` | SHOULD | Where the story/preview/test is defined, relative to the repository root. |
| `code.component`, `code.componentFile` | MAY | The component rendered and its file. Agents fixing drift start here. |
| `variant` | MAY | What makes this capture differ from its siblings: `theme`, `locale`, `fontScale`, `viewport`, `args`, or any other key. |
| `capture.method` | SHOULD | `browser`, `simulator`, `emulator`, `device`, `jvm-render`, `headless-render`, `design-export`, `manual`. |
| `capture.device` | MAY | `{name, os}` for device-like captures. |
| `capture.viewport` | MAY | `{width, height}` in CSS px / points, for browser captures. |
| `capture.scale` | SHOULD | Image pixels per CSS px / point (1, 2, 2.625, 3). Scry uses it to line captures up with Figma. |
| `capture.size` | MAY | Image size in pixels; Scry checks it against the file. |
| `capture.crop` | MAY | `root` (cropped to the component), `viewport`, `fullpage`, `element`, `none`. |
| `links.live` | MAY | A URL that renders this capture live (a Storybook iframe URL). When present, Scry embeds it; when absent, Scry shows the image. |
| `links.page` | MAY | The product URL the capture was taken from (crawler, E2E). |
| `links.figma` | MAY | A Figma node URL this capture is meant to match. Scry proposes it as a link. |
| `flow` | MAY | `{id, name, step, order}` for captures that belong to a user flow. |
| `structure` | MAY | *Experimental.* A UI tree for this capture, as a JSON file in the bundle: `{file, origin, format}`. `origin` says where it came from: `dom`, `rn-fiber`, `compose-semantics`, `uiautomator`, `xcui-accessibility`, `flutter-widgets`, or `x-<name>`. `format` is `scf-tree/1` (below). |
| `sourceText` | MAY | *Experimental, opt-in only.* `{file, path}`: the component's source text, copied into the bundle. Adapters MUST NOT include it unless the user explicitly turns it on, and SHOULD say so in their output. |
| `tags` | MAY | Free-form strings. |
| `x-<vendor>` | MAY | Anything else; preserved and returned by the API, never interpreted. |

## scf-tree/1 (experimental)

A UI tree every platform can write, shaped like a design layer tree so a reader can pair nodes with Figma layers.

```json
{
  "format": "scf-tree/1",
  "units": "pt",
  "root": {
    "type": "Pressable", "role": "button", "testId": "add-to-order",
    "bounds": { "x": 16, "y": 402, "width": 361, "height": 48 },
    "style": { "background": "#1F2430", "cornerRadius": 10, "padding": [12, 16, 12, 16], "opacity": 1 },
    "sourceRef": { "file": "src/components/Button.tsx", "line": 41 },
    "children": [
      { "type": "Text", "text": "Add to order",
        "bounds": { "x": 140, "y": 416, "width": 113, "height": 20 },
        "style": { "color": "#FFFFFF", "fontFamily": "Inter", "fontSize": 16, "fontWeight": 600, "lineHeight": 20 } }
    ]
  }
}
```

- `bounds` are in `units` (`pt` = CSS px / points, the same space as `capture.viewport`), relative to the image's top left
  divided by `capture.scale`.
- Every node field is optional except `type`. Write what the platform exposes, and leave out what it doesn't: a
  missing `style` means "unknown", never "none".
- `style` keys: `color`, `background`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`,
  `cornerRadius`, `borderWidth`, `borderColor`, `padding` [top, right, bottom, left], `opacity`, `shadow`. Colours are `#RRGGBB` or
  `#RRGGBBAA`. Extra keys are allowed with an `x-` prefix.
- Trees SHOULD be at most 2 MB and 5,000 nodes; readers may truncate larger trees. The validator emits a
  `STRUCTURE_TREE_LARGE` warning (never an error) above that size.

What each platform can usually provide:

| origin | Bounds + text | Style |
|---|---|---|
| `dom` (browser, with computed styles) | yes | full |
| `rn-fiber` (React Native component tree + measured layout) | yes | from React Native style objects |
| `flutter-widgets` | yes | text styles and sizes |
| `compose-semantics` | yes | none (semantics carry no colours or fonts) |
| `uiautomator` (Android Views) | yes | none |
| `xcui-accessibility` (iOS) | yes | none |

## Id stability across builds

`id` MUST be unique within a bundle, and SHOULD stay the same for the same UI state from one build to the next.
Everything Scry links to a capture (Figma links, issues, history) hangs off the id. Scry warns on upload when more
than 20% of a source's ids are new compared with its previous build ("did the adapter change its id scheme?"), and
lists the ids that disappeared.

## Validation and upload

- `npx @scrymore/scf validate <dir|zip>` checks the schema, image files, sizes, duplicate ids and images, counts
  and forbidden files, and prints every problem with the capture id. Exit code 0 means Scry will accept it.
- `npx @scrymore/scry-deployer upload <dir|zip> --project <id>` validates, then uploads with the project API key.
- The server runs the same validator and rejects the whole bundle with the same messages. A bundle is never
  half-accepted.

### Validator error and warning codes

Errors fail the whole bundle (exit 1); warnings do not (exit 0).

| Code | Severity | Meaning |
|---|---|---|
| `SCF_JSON_MISSING` | error | No `scf.json` at the bundle root, and no legacy `metadata.json` to convert. |
| `SCF_JSON_INVALID` | error | `scf.json` is not valid JSON, or not an object. |
| `SCF_VERSION_UNSUPPORTED` | error | `scf` is missing, not a string, or not the current or previous minor version. |
| `CAPTURES_MISSING` | error | `captures` is absent, and not `"sidecars"` either. |
| `CAPTURE_ID_INVALID` | error | A capture's `id` is missing, empty, not a string, or over 512 chars. |
| `CAPTURE_IMAGE_MISSING` | error | A capture's `image` field is missing or empty. |
| `IMAGE_FILE_MISSING` | error | A capture's `image` path does not exist in the bundle. |
| `DUPLICATE_ID` | error | Two or more captures share the same `id`. |
| `SHARED_IMAGE` | error | Two or more captures share the same `image` path. |
| `IMAGE_FORMAT_INVALID` | error | An image file is not PNG, JPEG or WebP by extension/signature. |
| `IMAGE_TOO_LARGE` | error | An image file is over 20 MB. |
| `FORBIDDEN_MEMBER` | error | A bundle member is not `scf.json`, an image, a referenced `structure`/`sourceText` file, or a sidecar `*.json`. |
| `COUNTS_MISMATCH` | error | `counts.captured` is present and does not equal `captures.length`. |
| `INVALID_SCALE` | error | `capture.scale` is present and not a finite number greater than 0. |
| `STRUCTURE_TREE_LARGE` | warning | A referenced `structure` file is over 2 MB. |
| `ID_CHURN` | warning | More than 20% of a source's ids are new versus its previous build (upload-time only; not a bundle-shape check). |

Unknown fields, including unrecognised `x-<vendor>` keys, are never an error: they are preserved and ignored.

## Compatibility

- sbcov's current `metadata.json` + `sbcov-manifest.json` bundles stay accepted and are converted to SCF on ingest
  (`id` = storyId, `code.file` = filepath, `capture` from the existing block, `links.live` from the build's Storybook).
- Converters ship for Sentry-style PNG + JSON folders and Argos builds.

## What ships with the spec (this repo)

1. This document, versioned, with a changelog.
2. JSON Schema `scf-1.0.json` and `scf-tree-1.json` at stable URLs, with `x-stability` on every property.
3. The validator (npm package `@scrymore/scf`, also used server-side; not yet published — vendored until the
   sbcov public flip).
4. Conformance fixtures: valid and invalid bundles with the expected validator output.
5. `AGENTS.md`: a guide written for coding agents, "How to write a Scry adapter": the steps, the checklist
   (ids that stay the same across builds, honest counts, scale, crop, a structure tree where the platform exposes one,
   source text only when the user opts in, validate before upload), and three short reference adapters to copy
   (a Playwright script, a folder-of-PNGs converter, a Compose preview test).
6. Reference adapters: a Playwright page-crawl adapter, a folder-of-PNGs converter, an illustrative Compose preview
   test, and converters for Sentry-style folders and Argos builds.
