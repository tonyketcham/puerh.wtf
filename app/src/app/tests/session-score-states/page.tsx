import TestPageWrapper from "@/lib/components/TestPageWrapper"
import SessionCard from "@/lib/components/SessionCard"
import MiniRadar from "@/lib/components/dataviz/radar/MiniRadar"
import FlavorGlyph from "@/lib/components/command/FlavorGlyph"
import { buildRelationIndex, computeStats, flavorCentroid, ratingRank } from "@/lib/relations"
import { FLAVOR_AXES, type ExplorerSession, type SessionFlavorAxes } from "@/lib/types/session"

const profile = (finish: number | null) =>
	Object.fromEntries(FLAVOR_AXES.map((axis) => [axis, { start: 6, finish }])) as SessionFlavorAxes
const sample = (slug: string, rating: number | null, finish: number | null): ExplorerSession => ({
	id: slug,
	_slug: slug,
	_collection: "Session",
	title: slug,
	date: "2021-01-01",
	production_year: 2020,
	excerpt: "Score-state fixture",
	style: [],
	vendor: [],
	images: null,
	rating,
	notes: null,
	flavor_axes: profile(finish),
	brewing: null,
})

export default function ScoreStatesTestPage() {
	const missing = sample("unrated", -1, null),
		rated = sample("rated", 80, 8)
	const sessions = [missing, rated, sample("zero", 0, 0), sample("absent", null, null)]
	const index = buildRelationIndex(sessions)
	return (
		<TestPageWrapper>
			<main className="p-8 max-w-5xl mx-auto space-y-6">
				<h1>Session score states</h1>
				<output data-score-checks>
					{JSON.stringify({
						mean: computeStats(sessions).avgRating,
						unratedRank: ratingRank(index, "unrated"),
						ratedRank: ratingRank(index, "rated"),
						missingFinish: flavorCentroid([missing])?.cream.finish,
						mixedFinish: flavorCentroid([missing, rated])?.cream.finish,
					})}
				</output>
				{[missing, rated, sessions[2]].map((session) => (
					<section key={session._slug} data-score-state={session._slug}>
						<SessionCard session={session} variant="hero" now={new Date("2021-02-01")} />
					</section>
				))}
				<div data-mini-single>
					<MiniRadar data={profile(null)} color="currentColor" className="size-24" />
				</div>
				<div data-mini-double>
					<MiniRadar data={profile(0)} color="currentColor" className="size-24" />
				</div>
				{[null, undefined, 0].map((finish) => (
					<div key={String(finish)} data-glyph-finish={String(finish)}>
						{[false, true].map((active) => (
							<FlavorGlyph
								key={String(active)}
								axes={
									Object.fromEntries(
										FLAVOR_AXES.map((axis) => [axis, { start: 6, finish }])
									) as SessionFlavorAxes
								}
								active={active}
								color="currentColor"
							/>
						))}
					</div>
				))}
			</main>
		</TestPageWrapper>
	)
}
