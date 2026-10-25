import SessionLog from "@/lib/components/home/SessionLog"
import { getExplorerSessions, getVendors } from "@/lib/api"
import { getEntityList } from "@/lib/content/entities.server"
import type { DrawnVessel } from "@/lib/components/teaware-drawing/TeawareDrawing"
import Hero, { type HeroStats } from "@/lib/components/home/Hero"

export default async function HomePage() {
	const [all, vessels, origins, vendors] = await Promise.all([
		getExplorerSessions(),
		getEntityList("vessel"),
		getEntityList("origin"),
		getVendors(),
	])
	// One clock for the whole list, so every card's tape ages against the same "now".
	const now = new Date()
	// how often each vessel was brewed in, and when last
	const use = new Map<string, { n: number; last: string }>()
	for (const s of all)
		for (const v of s.vessel ?? []) {
			const u = use.get(v._slug) ?? { n: 0, last: "" }
			u.n++
			if (s.date > u.last) u.last = s.date
			use.set(v._slug, u)
		}
	const drawn: DrawnVessel[] = vessels.map((v) => ({
		slug: v.slug,
		title: v.title,
		hanzi: v.hanzi,
		kind: v.vessel?.kind ?? null,
		material: v.vessel?.material ?? null,
		volume_ml: v.vessel?.volume_ml ?? null,
		sessions: use.get(v.slug)?.n ?? 0,
		lastBrewed: use.get(v.slug)?.last.slice(0, 10).replace(/-/g, ".") || null,
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
			<SessionLog sessions={all} now={now} />
		</div>
	)
}
