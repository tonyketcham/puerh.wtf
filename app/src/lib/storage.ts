/**
 * Where teas aged (plan §3.5, D11): the storage places that `storage[].place` names, and the
 * timeline a session's stints make between its vintage and the day it was tasted.
 *
 * Storage places are attributes, not entities (plan §2.2): they get no page, but those that are
 * also origins (Menghai, Bulang, Taiwan…) link to the origin, white2tea's warehouse links to the
 * vendor, and every place with a point is a small node on the /origins map's storage layer.
 * Points are city centroids (or a region's middle), so a line ends "in Guangzhou", not at a
 * warehouse. Pure module (no React).
 */
import type { StorageHumidity, StorageStint } from "@/lib/types/session"

export type StoragePlace = {
	key: string
	title: string
	hanzi?: string
	/** null for places with no point: "somewhere", a home fridge */
	lon: number | null
	lat: number | null
	/** "city" when the text names one; "region" for a province, an island or a country */
	precision: "city" | "region" | "none"
	/** the origin page the place also is */
	origin?: string
	/** the vendor whose storage it is */
	vendor?: string
}

const place = (p: StoragePlace) => p

export const STORAGE_PLACES: Readonly<Record<string, StoragePlace>> = {
	guangxi: place({
		key: "guangxi",
		title: "Guangxi",
		hanzi: "广西",
		lon: 108.8,
		lat: 23.8,
		precision: "region",
		origin: "guangxi",
	}),
	ohio: place({ key: "ohio", title: "Ohio", lon: null, lat: null, precision: "region" }),
	guangzhou: place({
		key: "guangzhou",
		title: "Guangzhou",
		hanzi: "广州",
		lon: 113.26,
		lat: 23.13,
		precision: "city",
	}),
	"hong-kong": place({
		key: "hong-kong",
		title: "Hong Kong",
		hanzi: "香港",
		lon: 114.17,
		lat: 22.32,
		precision: "city",
	}),
	kunming: place({
		key: "kunming",
		title: "Kunming",
		hanzi: "昆明",
		lon: 102.71,
		lat: 25.04,
		precision: "city",
	}),
	menghai: place({
		key: "menghai",
		title: "Menghai",
		hanzi: "勐海",
		lon: 100.451,
		lat: 21.96,
		precision: "city",
		origin: "menghai",
	}),
	bulang: place({
		key: "bulang",
		title: "Bulang",
		hanzi: "布朗山",
		lon: 100.45,
		lat: 21.65,
		precision: "region",
		origin: "bulang",
	}),
	xishuangbanna: place({
		key: "xishuangbanna",
		title: "Xishuangbanna",
		hanzi: "西双版纳",
		lon: 100.8,
		lat: 22.01,
		precision: "region",
		origin: "xishuangbanna",
	}),
	fujian: place({
		key: "fujian",
		title: "Fujian",
		hanzi: "福建",
		lon: 118.22,
		lat: 26.19,
		precision: "region",
		origin: "fujian",
	}),
	taiwan: place({
		key: "taiwan",
		title: "Taiwan",
		hanzi: "台湾",
		lon: 121.0,
		lat: 23.7,
		precision: "region",
		origin: "taiwan",
	}),
	malaysia: place({
		key: "malaysia",
		title: "Malaysia",
		hanzi: "马来西亚",
		lon: 101.69,
		lat: 3.14,
		precision: "region",
	}),
	"united-states": place({
		key: "united-states",
		title: "the US",
		lon: -98.5,
		lat: 39.8,
		precision: "region",
	}),
	// white2tea's own storage: placed where the vendor ships from (map/vendorPlaces.ts)
	white2tea: place({
		key: "white2tea",
		title: "white2tea's storage",
		lon: 102.71,
		lat: 25.04,
		precision: "region",
		vendor: "white2tea",
	}),
	home: place({ key: "home", title: "a home fridge", lon: null, lat: null, precision: "none" }),
	unknown: place({ key: "unknown", title: "somewhere", lon: null, lat: null, precision: "none" }),
}

/** A place key as a place (unrecognized keys keep their name and get no point). */
export function storagePlace(key: string | null | undefined): StoragePlace {
	const k = (key || "unknown").trim()
	return STORAGE_PLACES[k] ?? { key: k, title: k, lon: null, lat: null, precision: "none" }
}

export const HUMIDITY: Record<StorageHumidity, { label: string; color: string; title: string }> = {
	dry: { label: "dry", color: "#e3cf9c", title: "Dry storage" },
	natural: { label: "natural", color: "#c08a52", title: "Natural (ambient) storage" },
	wet: { label: "wet", color: "#6f9b8a", title: "Wet (humid) storage" },
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type StorageSegment = {
	stint: StorageStint
	place: StoragePlace
	start: number
	end: number
	/** the text gave no start / end year: it's drawn from the vintage or the tasting */
	openStart: boolean
	openEnd: boolean
}

export type StorageTimeline = {
	segments: StorageSegment[]
	/** [first year, last year] of the axis */
	domain: [number, number]
	vintage: number | null
	tasted: number | null
}

const year = (v: unknown) => {
	const n = Math.trunc(Number(v))
	return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * A session's stints laid out in years. Missing years are inferred from the neighbours: the
 * first stint starts at the vintage, the last ends at the tasting, and an unbounded stint in
 * the middle meets the next one. Null when there are no stints.
 */
export function storageTimeline(
	stints: readonly (StorageStint | null | undefined)[] | null | undefined,
	vintageYear: unknown,
	tastedOn: string | number | Date | null | undefined
): StorageTimeline | null {
	const list = (stints || []).filter((s): s is StorageStint => !!s?.place)
	if (!list.length) return null
	const vintage = year(vintageYear)
	const tastedDate = tastedOn != null ? new Date(tastedOn) : null
	const tasted = tastedDate && !Number.isNaN(tastedDate.getTime()) ? tastedDate.getFullYear() : null

	const segments: StorageSegment[] = []
	list.forEach((stint, i) => {
		const prev = segments[i - 1]
		const next = list[i + 1]
		const from = year(stint.from)
		const to = year(stint.to)
		const start = from ?? (prev ? prev.end : vintage ?? to ?? tasted ?? 0)
		const end = to ?? (next ? year(next.from) ?? start : tasted ?? start)
		segments.push({
			stint,
			place: storagePlace(stint.place),
			start,
			// a stint inside one year still gets a sliver
			end: Math.max(end, start + 0.5),
			openStart: from == null,
			openEnd: to == null,
		})
	})
	const lo = Math.min(...segments.map((s) => s.start), vintage ?? Infinity)
	const hi = Math.max(...segments.map((s) => s.end), tasted ?? -Infinity)
	return { segments, domain: [lo, Math.max(hi, lo + 1)], vintage, tasted }
}

/** "7 yrs", "~20 yrs", "6 mo"; null when the stint has no years of its own. */
export function stintLength(seg: StorageSegment): string | null {
	if (seg.openStart && seg.openEnd) return null
	const years =
		seg.stint.to != null && seg.stint.from != null ? seg.stint.to - seg.stint.from : null
	if (years == null) return null
	const approx = seg.stint.approx ? "~" : ""
	return years <= 0 ? "< 1 yr" : `${approx}${years} ${years === 1 ? "yr" : "yrs"}`
}

/** "Menghai 7 yrs → Guangzhou 7 yrs": a one-line reading of the stints. */
export function storageSummary(stints: readonly StorageStint[] | null | undefined): string {
	return (stints || [])
		.filter((s) => s?.place)
		.map((s) => {
			const p = storagePlace(s.place)
			const years = s.from != null && s.to != null ? s.to - s.from : null
			const len = years != null ? ` ${s.approx ? "~" : ""}${Math.max(years, 0) || "<1"}y` : ""
			return `${s.humidity ? `${s.humidity} ` : ""}${p.title}${len}`
		})
		.join(" → ")
}
