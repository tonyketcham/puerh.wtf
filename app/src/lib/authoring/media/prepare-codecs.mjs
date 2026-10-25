import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(here, "../../../..")
const require = createRequire(import.meta.url)
const output = path.join(app, "public/authoring-codecs/v1")
await mkdir(output, { recursive: true })

async function copyPackage(name, folder, entries) {
	const packageRoot = path.dirname(require.resolve(name + "/package.json"))
	for (const entry of entries) {
		await mkdir(path.dirname(path.join(output, folder, entry)), { recursive: true })
		await cp(path.join(packageRoot, entry), path.join(output, folder, entry), { recursive: true })
	}
	const metadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"))
	return { name, version: metadata.version }
}
const packages = await Promise.all([
	copyPackage("@jsquash/webp", "webp", [
		"codec/enc",
		"codec/LICENSE.codec.md",
		"meta.js",
		"LICENSE",
	]),
	copyPackage("@jsquash/resize", "resize", ["index.js", "meta.js", "util.js", "lib", "LICENSE"]),
])
await Promise.all(
	["optimizer.worker.js", "limits.js"].map((name) =>
		cp(path.join(here, name), path.join(output, name))
	)
)
await writeFile(
	path.join(output, "runtime.json"),
	JSON.stringify({ version: 1, packages }, null, 2) + "\n"
)
console.log("Prepared self-hosted authoring image worker and WASM codecs.")

await writeFile(
	path.join(output, "README.md"),
	`# Self-hosted image codecs

Generated from installed jSquash packages by prepare-codecs.mjs.
${packages.map((p) => "- " + p.name + " " + p.version).join("\n")}

Sources: https://github.com/jamsinclair/jSquash/tree/main/packages/webp
and https://github.com/jamsinclair/jSquash/tree/main/packages/resize

Package Apache-2.0 notices: webp/LICENSE and resize/LICENSE.
The libwebp encoder notice is preserved in webp/codec/LICENSE.codec.md
(upstream: https://chromium.googlesource.com/webm/libwebp/).
Resize implementation notices are preserved under resize/lib/*/LICENSE.codec.md.
These include the MIT resize/magic-kernel notices and the Apache-2.0 hqx notice.
The application worker and limits modules are project source.
`
)
