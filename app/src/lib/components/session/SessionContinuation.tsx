import Link from "next/link"
import type { ExplorerSession, SessionFull } from "@/lib/types/session"
import { sessionPath } from "@/lib/siteMetadata"
import journal from "@/generated/session-journal.json"

const entries = journal as Record<string, { previous_session?: string }>
function teaRoot(id: string): string {
	const seen = new Set<string>()
	while (entries[id]?.previous_session && !seen.has(id)) {
		seen.add(id)
		id = entries[id].previous_session!
	}
	return id
}

export default function SessionContinuation({
	session,
	sessions,
	recordingKey,
}: {
	session: SessionFull
	sessions: readonly ExplorerSession[]
	recordingKey?: string
}) {
	const ordered = [...sessions].sort(
		(a, b) => Date.parse(b.date) - Date.parse(a.date) || a._slug.localeCompare(b._slug)
	)
	const at = ordered.findIndex((s) => s.id === session.id)
	const older = at >= 0 ? ordered[at + 1] : undefined
	const newer = at > 0 ? ordered[at - 1] : undefined
	const revisits = ordered.filter(
		(s) => s.id !== session.id && teaRoot(s.id) === teaRoot(session.id)
	)
	return (
		<footer
			className="space-y-6 border-t border-white/10 pt-6 pb-8"
			data-recording-key={recordingKey}
		>
			<nav
				aria-label="Continue the tea log"
				className="grid grid-cols-1 gap-5 @md/editor:grid-cols-2"
			>
				{older && (
					<Link
						className="block rounded-lg border border-white/10 p-4 hover:bg-white/5"
						href={sessionPath(older)}
					>
						<span className="block text-xs text-white/50 mb-2">← Older session</span>
						{older.title}
					</Link>
				)}
				{newer && (
					<Link
						className="block rounded-lg border border-white/10 p-4 hover:bg-white/5"
						href={sessionPath(newer)}
					>
						<span className="block text-xs text-white/50 mb-2">Newer session →</span>
						{newer.title}
					</Link>
				)}
			</nav>
			{revisits.length > 0 && (
				<section>
					<h2 className="mb-3">This tea, again</h2>
					<ul className="space-y-3">
						{revisits.map((s) => (
							<li key={s.id}>
								<Link className="underline underline-offset-4" href={sessionPath(s)}>
									{s.date.slice(0, 10)} · {s.title}
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
			<nav
				aria-label="Explore this tea"
				className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/70"
			>
				{session.vendor?.map((v) => (
					<Link
						key={v._slug}
						className="underline underline-offset-4"
						href={"/vendors/" + v._slug + "/"}
					>
						More from {v.title}
					</Link>
				))}
				{session.origin?.map((o) => (
					<Link
						key={o._slug}
						className="underline underline-offset-4"
						href={"/origins/" + o._slug + "/"}
					>
						Explore {o.title}
					</Link>
				))}
				<Link className="underline underline-offset-4" href="/">
					All sessions
				</Link>
				<a className="underline underline-offset-4" href="/feed.xml">
					RSS feed
				</a>
			</nav>
			<details className="text-sm text-white/55">
				<summary className="cursor-pointer py-2">About the ratings</summary>
				<p className="max-w-prose mt-2 leading-relaxed">
					Ratings record personal enjoyment out of 100. Higher means more enjoyed at that tasting;
					they are not an objective quality grade. An unscored session has no rating.
				</p>
			</details>
		</footer>
	)
}
