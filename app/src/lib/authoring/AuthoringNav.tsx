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
				categories: "categories",
				cultivars: "cultivars",
				teaware: "vessels",
			} as Record<string, string>
		)[part] || "tastings"
	const routeParts = pathname.split("/").filter(Boolean)
	const contextual = Boolean(
		(
			{
				sessions: 4,
				vendors: 2,
				origins: 2,
				styles: 2,
				categories: 2,
				cultivars: 2,
				teaware: 2,
			} as Record<string, number>
		)[routeParts[0]] &&
			routeParts.length >= (({ sessions: 4 } as Record<string, number>)[routeParts[0]] || 2)
	)
	const singular =
		collection === "tastings"
			? "session"
			: collection === "vessels"
			? "teaware"
			: collection === "categories"
			? "category"
			: collection.slice(0, -1)
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
				+ New {singular}
			</button>
			{contextual && collection !== "tastings" && (
				<button onClick={() => request({ action: "session", pathname })}>
					+ Log a session here
				</button>
			)}
			{contextual && (
				<button onClick={() => request({ action: "edit", pathname })}>Edit this {singular}</button>
			)}
			{drafts.length > 0 && (
				<div className="cms-explorer-drafts">
					<h3>Local &amp; unpublished</h3>
					{drafts.map((d) => (
						<Link key={d.id} href={"/write/?id=" + encodeURIComponent(d.id)}>
							{d.title}
							<small>{d.dirty ? "On this device" : "Unpublished · edition #" + d.prNumber}</small>
						</Link>
					))}
				</div>
			)}
		</section>
	)
}
