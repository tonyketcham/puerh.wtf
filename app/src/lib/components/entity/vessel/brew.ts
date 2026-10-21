/**
 * How a vessel gets used, from the sessions brewed in it: the mean brew (water, leaf ratio,
 * first steep, increment) and when it was in rotation. Pure (no React): the peek card, the
 * vessel page and /teaware share it.
 */
import type { ExplorerSession } from "@/lib/types/session"

export type BrewProfile = {
	/** sessions with brewing numbers */
	n: number
	/** °F */
	temperature: number | null
	/** ml of water */
	liquid: number | null
	/** grams of leaf */
	leaf: number | null
	/** ml per gram, from the means */
	ratio: number | null
	/** seconds */
	first: number | null
	increment: number | null
}

const mean = (values: number[]) =>
	values.length ? values.reduce((a, b) => a + b, 0) / values.length : null

export function brewProfile(sessions: readonly ExplorerSession[]): BrewProfile {
	const brews = sessions.map((s) => s.brewing).filter((b): b is NonNullable<typeof b> => !!b)
	const pick = (f: (b: typeof brews[number]) => number | null | undefined) =>
		mean(brews.map((b) => Number(f(b))).filter((v) => Number.isFinite(v) && v > 0))
	const liquid = pick((b) => b.liquid_amount)
	const leaf = pick((b) => b.material_amount)
	return {
		n: brews.length,
		temperature: pick((b) => b.temperature),
		liquid,
		leaf,
		ratio: liquid && leaf ? liquid / leaf : null,
		first: pick((b) => b.first_infusion_duration),
		increment: pick((b) => b.infusion_increment),
	}
}

/** The brew as short facts: `fill 100 ml · ratio 1:14 · water 205°F · first 10 s`. */
export function brewFacts(p: BrewProfile): { k: string; v: string; title: string }[] {
	return [
		p.liquid && { k: "fill", v: `${Math.round(p.liquid)} ml`, title: "Mean water per steep" },
		p.ratio && { k: "ratio", v: `1:${Math.round(p.ratio)}`, title: "Leaf to water, by weight" },
		p.temperature && {
			k: "water",
			v: `${Math.round(p.temperature)}°F`,
			title: `Mean water temperature (${Math.round(((p.temperature - 32) * 5) / 9)}°C)`,
		},
		p.first && {
			k: "first",
			v: `${Math.round(p.first)} s`,
			title: p.increment
				? `First steep, then +${Math.round(p.increment)} s a steep`
				: "First steep",
		},
	].filter(Boolean) as { k: string; v: string; title: string }[]
}

/** Session time (ms), or null for an unparseable date. */
export const sessionTime = (s: ExplorerSession) => {
	const t = new Date(s.date).getTime()
	return Number.isFinite(t) ? t : null
}

/** [first, last] session time across a set of sessions: the axis a use strip is drawn on. */
export function timeDomain(sessions: readonly ExplorerSession[]): [number, number] | null {
	const times = sessions.map(sessionTime).filter((t): t is number => t != null)
	if (!times.length) return null
	const lo = Math.min(...times)
	const hi = Math.max(...times)
	// a single day still needs a width
	return [lo, Math.max(hi, lo + 864e5 * 30)]
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })

/** "Nov 2020 – Jan 2021" (one month: "Mar 2021"). */
export function rotationLabel(sessions: readonly ExplorerSession[]): string | null {
	const times = sessions.map(sessionTime).filter((t): t is number => t != null)
	if (!times.length) return null
	const a = MONTH.format(Math.min(...times))
	const b = MONTH.format(Math.max(...times))
	return a === b ? a : `${a} – ${b}`
}
