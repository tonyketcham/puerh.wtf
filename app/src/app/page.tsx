import SessionCard from '@/lib/components/SessionCard';
import Heading2 from '@/lib/components/typography/Heading2';
import { getSessions } from '@/lib/api';

export default async function HomePage() {
	const sessions = await getSessions({ limit: 10, withImages: true });

	return (
		<div className="relative inset-0 h-screen pl-56 py-6 space-y-1.5 mx-28">
			<section className="block w-full">
				<Heading2>A tea log</Heading2>
				<p className="max-w-prose">
					...for documenting tea sessions to learn complexities like terroir in retrospect while
					focusing more on an individual tea.
				</p>
			</section>
			<section className="space-y-2.5">
				<h3 className="my-4 text-sm text-tea-soup-400">🫖 recents</h3>
				{sessions.map((session) => (
					<SessionCard key={session.id} session={session} />
				))}
			</section>
		</div>
	);
}
