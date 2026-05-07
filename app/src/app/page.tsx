import SessionCard from "@/lib/components/SessionCard"
import Heading2 from "@/lib/components/typography/Heading2"
import { getSessions } from "@/lib/api"

export default async function HomePage() {
	const sessions = await getSessions({ limit: 10, withImages: true })

	return (
		<div className="relative inset-0 h-screen py-6 space-y-1.5">
			<section className="block w-full">
				<Heading2>A tea log</Heading2>
				<p className="max-w-prose">
					...for documenting tea sessions to learn complexities like terroir in retrospect while
					focusing more on an individual tea.
				</p>
			</section>
			<section className="space-y-2.5">
				<h3 className="my-4 text-sm text-tea-soup-400">🫖 recents</h3>
				<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-1 items-start">
					{sessions.map((session) => (
						<SessionCard key={session.id} session={session} />
					))}
				</div>
			</section>
		</div>
	)
}
