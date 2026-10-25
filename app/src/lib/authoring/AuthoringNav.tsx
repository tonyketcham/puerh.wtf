"use client"
import Link from "next/link"
import { useAtomValue, useSetAtom } from "jotai"
import { usePathname } from "next/navigation"
import { authoringBridgeAtom, requestAuthoringAtom } from "./bridge"
export default function AuthoringNav({ view }: { view?: string }) {
	const state = useAtomValue(authoringBridgeAtom),
		request = useSetAtom(requestAuthoringAtom),
		pathname = usePathname()
	if (!state.enabled) return null
	const part = view || pathname.split("/").filter(Boolean)[0]
	const collection =
		(
			{
				sessions: "tastings",
				vendors: "vendors",
				origins: "origins",
				styles: "styles",
				cultivars: "cultivars",
				teaware: "vessels",
			} as Record<string, string>
		)[part] || "tastings"
	const drafts = state.drafts.filter((d) => d.collection === collection)
	return (
		<section className="cms-explorer-tools" aria-label="Authoring">
			<Link href="/working-changes/">
				Working changes <span>{state.count}</span>
			</Link>
			<button
				onClick={() =>
					request({
						action: "new",
						collection: collection as import("./types").Collection,
						pathname,
					})
				}
			>
				+ New {collection === "tastings" ? "session" : collection.slice(0, -1)}
			</button>
			<button onClick={() => request({ action: "session", pathname })}>+ Log a session here</button>
			<button onClick={() => request({ action: "edit", pathname })}>Edit this record</button>
			{drafts.length > 0 && (
				<div className="cms-explorer-drafts">
					<h3>Local &amp; unpublished</h3>
					{drafts.map((d) => (
						<Link key={d.id} href={"/write/?id=" + encodeURIComponent(d.id)}>
							{d.title}
							<small>{d.dirty ? "Local edits" : "PR #" + d.prNumber}</small>
						</Link>
					))}
				</div>
			)}
		</section>
	)
}
