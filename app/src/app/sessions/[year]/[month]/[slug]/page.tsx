import { getSession, getSessions } from "@/lib/api"
import { notFound } from "next/navigation"
import Image from "next/image"
import RadarChart from "@/lib/components/dataviz/radar/RadarChart"
import Panel from "@/lib/components/containers/Panel"
import DetailsListItem from "@/lib/components/DetailsListItem"
import { GiSteam, GiLips, GiNoseSide } from "react-icons/gi"

interface SessionPageProps {
	params: {
		year: string
		month: string
		slug: string
	}
}

export async function generateStaticParams() {
	const sessions = await getSessions()
	return sessions.map((session) => {
		const date = session.date ? new Date(session.date) : null
		return {
			year: date ? String(date.getFullYear()) : "",
			month: date ? String(date.getMonth() + 1).padStart(2, "0") : "",
			slug: session._slug,
		}
	})
}

export default async function SessionPage({ params }: SessionPageProps) {
	const session = await getSession(params.slug)

	if (!session) {
		notFound()
	}

	return (
		<main className="flex-1 bg-background text-ink">
			<div className="grid grid-cols-12 gap-8 p-8">
				<div className="col-span-8 space-y-8">
					<h1 className="font-rock-3d text-8xl text-shadow-2xl">{session.title}</h1>

					{session.images && session.images.length > 0 && (
						<div className="relative h-[500px]">
							<Image
								src={session.images[0].image}
								alt={session.images[0].alt || ""}
								fill
								className="object-cover rounded-lg"
							/>
						</div>
					)}

					<article
						className="prose prose-invert max-w-none"
						dangerouslySetInnerHTML={{ __html: session._content.html }}
					/>
				</div>

				<aside className="col-span-4 space-y-8">
					<Panel>
						<h2 className="mb-4 text-lg font-fira-code">Flavor Profile</h2>
						{session.flavor_axes && <RadarChart data={session.flavor_axes} />}
					</Panel>

					<Panel>
						<h2 className="mb-4 text-lg font-fira-code">Notes</h2>
						<ul className="space-y-4">
							<DetailsListItem
								icon={<GiNoseSide />}
								title="Dry Leaf"
								value={session.notes.dry_leaf_nose}
							/>
							<DetailsListItem
								icon={<GiSteam />}
								title="Wet Leaf"
								value={session.notes.wet_leaf_nose}
							/>
							<DetailsListItem
								icon={<GiLips />}
								title="Mouthfeel"
								value={session.notes.mouthfeel}
							/>
						</ul>
					</Panel>
				</aside>
			</div>
		</main>
	)
}
