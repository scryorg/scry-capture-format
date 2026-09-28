/**
 * Reference SCF adapter (ILLUSTRATIVE ONLY — not built or run in this repo; there is no Gradle/JVM
 * toolchain here to compile it against). It shows the shape a JVM-side adapter would take for a
 * team using Android Studio's `@Preview` + a screenshot-testing library (Roborazzi,
 * ComposablePreviewScanner, Paparazzi, …) that already renders previews to bitmaps in a local test
 * run, without shelling out to Node.
 *
 * The pattern: after your existing screenshot test run has produced one PNG per @Preview function,
 * walk that same list and write scf.json next to the images — no different in spirit from the
 * folder-of-pngs example, just written in Kotlin because that's where the preview metadata
 * (composable name, file, line) already lives.
 *
 * `source.kind` is "compose-preview" (registered in spec/scf-1.0.md). `capture.method` is
 * "jvm-render" since these come from an in-process render, not a device or simulator.
 */
package com.scrymore.scf.examples

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/** One @Preview your screenshot-testing library already rendered before this writer runs. */
data class RenderedPreview(
    val id: String,             // e.g. "com.acme.ui.ButtonKt.PrimaryButtonPreview" — your tool's own
                                 // stable identifier; never sanitise it here.
    val imageFile: File,        // the PNG your screenshot library already wrote
    val componentFile: String,  // relative path to the .kt file containing the @Composable
    val componentLine: Int,
    val composableName: String,
    val previewName: String,
    val title: List<String>,    // e.g. listOf("Components", "Button") — your own grouping
)

@Serializable
data class ScfCaptureBlock(val method: String, val scale: Double)

@Serializable
data class ScfCode(val file: String, val line: Int, val component: String)

@Serializable
data class ScfLinks(val live: String? = null)

@Serializable
data class ScfCapture(
    val id: String,
    val image: String,
    val kind: String = "component",
    val title: List<String>,
    val name: String,
    val code: ScfCode,
    val capture: ScfCaptureBlock,
    val links: ScfLinks = ScfLinks(),
)

@Serializable
data class ScfSource(val kind: String, val platform: String, val framework: String)

@Serializable
data class ScfCounts(val declared: Int, val captured: Int)

@Serializable
data class ScfManifest(
    val scf: String = "1.0",
    val source: ScfSource,
    val counts: ScfCounts,
    val captures: List<ScfCapture>,
)

/**
 * Writes scf.json + copies each preview's PNG into outDir/images/, given the list your
 * screenshot-testing library already produced. Density is the device density your test config
 * rendered at (commonly 2.0 or 3.0 for a Pixel-class emulator profile) — this becomes SCF's
 * `capture.scale`, the same field a browser or simulator capture uses to line up with Figma points.
 */
fun writeScfBundle(previews: List<RenderedPreview>, outDir: File, density: Double) {
    val imagesDir = File(outDir, "images").apply { mkdirs() }

    val captures = previews.map { preview ->
        val destName = "${preview.id.replace(Regex("[^A-Za-z0-9]"), "_")}.png"
        preview.imageFile.copyTo(File(imagesDir, destName), overwrite = true)

        ScfCapture(
            id = preview.id, // the ORIGINAL id, never the sanitised destName, goes in scf.json
            image = "images/$destName",
            title = preview.title,
            name = preview.previewName,
            code = ScfCode(file = preview.componentFile, line = preview.componentLine, component = preview.composableName),
            capture = ScfCaptureBlock(method = "jvm-render", scale = density),
        )
    }

    val manifest = ScfManifest(
        source = ScfSource(kind = "compose-preview", platform = "android", framework = "compose"),
        counts = ScfCounts(declared = previews.size, captured = captures.size),
        captures = captures,
    )

    File(outDir, "scf.json").writeText(Json { prettyPrint = true }.encodeToString(manifest))
}

// Then: `npx @scrymore/scf validate outDir` from your CI step, same as any other adapter.
