import SessionCard from "@/lib/components/SessionCard"
import { getExplorerSessions, getSessions, getVendors } from "@/lib/api"
import { GaiwanIcon } from "@/lib/components/icons/TeaIcons"
import { getEntityList } from "@/lib/components/entity/page/data"
import type { DrawnVessel } from "@/lib/components/teaware-drawing/TeawareDrawing"
import Hero, { type HeroStats } from "@/lib/components/home/Hero"

export default async function HomePage() {
	const [sessions, all, vessels, origins, vendors] = await Promise.all([
		getSessions({ limit: 10, withImages: true }),
		getExplorerSessions(),
		getEntityList("vessel"),
		getEntityList("origin"),
		getVendors(),
	])
	// One clock for the whole list, so every card's tape ages against the same "now".
	const now = new Date()
	const drawn: DrawnVessel[] = vessels.map((v) => ({
		slug: v.slug,
		title: v.title,
		hanzi: v.hanzi,
		kind: v.vessel?.kind ?? null,
		material: v.vessel?.material ?? null,
		volume_ml: v.vessel?.volume_ml ?? null,
	}))

	const dates = all.map((s) => s.date).filter(Boolean).sort()
	const years = all.map((s) => s.production_year).filter((y): y is number => typeof y === "number")
	const stats: HeroStats = {
		sessions: all.length,
		since: dates.length ? new Date(dates[0]).getFullYear() : null,
		lastSteeped: dates.length ? dates[dates.length - 1].slice(0, 10).replace(/-/g, ".") : null,
		vintages: years.length ? [Math.min(...years), Math.max(...years)] : null,
		origins: origins.length,
		vendors: vendors.length,
		vessels: vessels.length,
	}

	return (
		<div className="relative inset-0 h-screen py-6 space-y-1.5">
			<Hero vessels={drawn} stats={stats} />
			<section className="space-y-2.5">
				<h3 className="flex items-center gap-3 my-4 text-sm text-tea-soup-400">
					<span className="flex items-center gap-1.5">
						<GaiwanIcon />
						recents
					</span>
					<span className="tabular-nums text-white/25">{sessions.length}</span>
					<span aria-hidden="true" className="flex-1 h-px bg-white/5" />
				</h3>
				<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-1 items-start">
					{sessions.map((session, i) => (
						<SessionCard key={session.id} session={session} enterIndex={i} now={now} />
					))}
				</div>
			</section>
		</div>
	)
}
