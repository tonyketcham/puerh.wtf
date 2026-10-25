/** Session summaries shared by entity and lexicon views, without an entity identity. */
import { liftLiquor, type RGB } from "@/lib/liquor"
import { sessionColor, type EntityStats } from "@/lib/relations"
import type { ExplorerSession } from "@/lib/types/session"

export type SessionAnalysis = {
	sessions: ExplorerSession[]
	/** Sessions that reference the subject directly. */
	direct: number
	stats: EntityStats
	/** What the centroid is read against. */
	reference: { label: string; stats: EntityStats }
	accent: string
	accentText: string
}

/** Sessions ordered by vintage, oldest first (undated last), for color timelines. */
export function byVintage(sessions: readonly ExplorerSession[]): ExplorerSession[] {
	const year = (s: ExplorerSession) => {
		const y = Math.trunc(Number(s.production_year))
		return Number.isFinite(y) && y > 0 ? y : Infinity
	}
	return [...sessions].sort((a, b) => year(a) - year(b) || a.title.localeCompare(b.title))
}

/** The liquors of a set of sessions as color stops, oldest vintage first. */
export function liquorStops(sessions: readonly ExplorerSession[]): string[] {
	return byVintage(sessions).map(sessionColor)
}

function hexToRgb(hex: string): RGB | null {
	const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
	if (!m) return null
	const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

const toHex = (rgb: RGB) =>
	`#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

const toLinear = (c: number) => {
	const s = c / 255
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const toSrgb = (l: number) =>
	255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.max(0, l) ** (1 / 2.4) - 0.055)

/** A liquor lifted until it reads on the #121012 ground (a dark shou would vanish otherwise). */
export function liftedColor(hex: string, minLuminance = 0.32): string {
	return toHex(liftLiquor(hexToRgb(hex) ?? [217, 164, 65], minLuminance))
}

/** Mean of several colors in linear light (what mixing the liquors would look like). */
export function blendColors(colors: readonly string[]): string {
	const rgbs = colors.map(hexToRgb).filter((c): c is RGB => !!c)
	if (!rgbs.length) return colors[0] ?? "#d9a441"
	const mean = [0, 1, 2].map((i) => rgbs.reduce((sum, c) => sum + toLinear(c[i]), 0) / rgbs.length)
	return toHex(mean.map(toSrgb) as unknown as RGB)
}
