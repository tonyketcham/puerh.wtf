import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"
import { infusionIssues } from "../src/lib/session-journal.mjs"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Optional fields are indexed from source, independently of Flatbread's inferred schema. */
export async function buildSessionJournalIndex(
	contentDir = path.join(appRoot, "content/tastings")
) {
	const index = {}
	for (const file of (await readdir(contentDir)).filter((name) => name.endsWith(".md")).sort()) {
		const raw = await readFile(path.join(contentDir, file), "utf8")
		const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
		if (!frontmatter) continue
		const data = parse(frontmatter[1])
		const issues = infusionIssues(data.infusions)
		if (issues.length) throw new Error(file + ": " + issues.join(" "))
		if (data.infusions?.length || data.previous_session) {
			if (typeof data.id !== "string") throw new Error(file + ": missing session ID.")
			index[data.id] = {
				...(data.infusions?.length ? { infusions: data.infusions } : {}),
				...(typeof data.previous_session === "string"
					? { previous_session: data.previous_session }
					: {}),
			}
		}
	}
	return index
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await writeFile(
		path.join(appRoot, "src/generated/session-journal.json"),
		JSON.stringify(await buildSessionJournalIndex(), null, 2) + "\n"
	)
}
