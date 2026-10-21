/**
 * Steep (infusion) helpers: brewing schedule math, steep-mention detection in session prose,
 * and brewing-parameter formatting. Pure module, safe on server and client.
 */
import type { SessionBrewing } from "@/lib/types/session"

export type SteepSlot = {
	/** 1-based infusion number (0 is reserved for the rinse) */
	n: number
	/** planned steep time in seconds */
	seconds: number
}

/**
 * Planned schedule from `first_infusion_duration` + `infusion_increment`:
 * steep n lasts first + (n - 1) * increment seconds. Returns [] when the first duration is unknown.
 */
export function computeSteepSchedule(
	brewing: SessionBrewing | null | undefined,
	count = 10
): SteepSlot[] {
	const first = brewing?.first_infusion_duration
	if (first == null || !Number.isFinite(first) || count <= 0) return []
	const inc = brewing?.infusion_increment ?? 0
	return Array.from({ length: count }, (_, i) => ({
		n: i + 1,
		seconds: Math.max(0, Math.round(first + i * inc)),
	}))
}

/** Planned seconds for steep n (1-based), or null when unknown. Rinse (n=0) returns null. */
export function steepSeconds(brewing: SessionBrewing | null | undefined, n: number): number | null {
	const first = brewing?.first_infusion_duration
	if (first == null || n < 1) return null
	return Math.max(0, Math.round(first + (n - 1) * (brewing?.infusion_increment ?? 0)))
}

// ---------------------------------------------------------------------------
// Mentions in prose
// ---------------------------------------------------------------------------

export type SteepMention = {
	/** steep number; 0 = rinse */
	n: number
	/** last steep number of a range ("steeps 3-5"), else undefined */
	nEnd?: number
	/** character offset of the match in the searched text */
	index: number
	/** matched text, e.g. "second infusion" */
	match: string
}

const ORDINAL_WORDS: Record<string, number> = {
	first: 1,
	second: 2,
	third: 3,
	fourth: 4,
	fifth: 5,
	sixth: 6,
	seventh: 7,
	eighth: 8,
	ninth: 9,
	tenth: 10,
	eleventh: 11,
	twelfth: 12,
	thirteenth: 13,
	fourteenth: 14,
	fifteenth: 15,
	sixteenth: 16,
	seventeenth: 17,
	eighteenth: 18,
	nineteenth: 19,
	twentieth: 20,
}

const STEEP_NOUN = "(?:steep|infusion|pour|brew|round|cup)s?"
const ORDINAL = `(?:${Object.keys(ORDINAL_WORDS).join("|")}|\\d{1,2}(?:st|nd|rd|th))`

/** "first steep", "2nd infusion", "third pour", "fourth round" */
const ORDINAL_THEN_NOUN = new RegExp(`\\b(${ORDINAL})\\s+${STEEP_NOUN}\\b`, "gi")
/** "steep 3", "infusion #4", "steeps 3-5", "round no. 2" (not cup: "cup 2" is rarely a steep) */
const NOUN_THEN_NUMBER = new RegExp(
	`\\b(?:steep|infusion|pour|brew|round)s?\\s*(?:#|no\\.?\\s*)?(\\d{1,2})(?:\\s*(?:-|–|to)\\s*(\\d{1,2}))?\\b`,
	"gi"
)
/** "rinse", "rinsed", "rinsing", "the wash" */
const RINSE = /\b(?:rins(?:e|ed|es|ing)|(?:the|a|quick)\s+wash)\b/gi

function ordinalValue(token: string): number | null {
	const lower = token.toLowerCase()
	if (lower in ORDINAL_WORDS) return ORDINAL_WORDS[lower]
	const m = lower.match(/^(\d{1,2})(?:st|nd|rd|th)$/)
	return m ? Number(m[1]) : null
}

/**
 * Detects explicit steep references in free text. Returns mentions sorted by index, without
 * overlaps. Vague references ("later steeps", "next round", "last cup") are ignored.
 */
export function findSteepMentions(text: string): SteepMention[] {
	if (!text) return []
	const out: SteepMention[] = []

	for (const m of text.matchAll(ORDINAL_THEN_NOUN)) {
		const n = ordinalValue(m[1])
		if (n != null && n > 0) out.push({ n, index: m.index ?? 0, match: m[0] })
	}
	for (const m of text.matchAll(NOUN_THEN_NUMBER)) {
		const n = Number(m[1])
		const nEnd = m[2] ? Number(m[2]) : undefined
		if (n > 0 && n < 100) {
			out.push({
				n,
				...(nEnd && nEnd > n ? { nEnd } : {}),
				index: m.index ?? 0,
				match: m[0],
			})
		}
	}
	for (const m of text.matchAll(RINSE)) {
		out.push({ n: 0, index: m.index ?? 0, match: m[0] })
	}

	out.sort((a, b) => a.index - b.index || b.match.length - a.match.length)
	// drop overlaps (keep the earliest / longest)
	const result: SteepMention[] = []
	let end = -1
	for (const mention of out) {
		if (mention.index < end) continue
		result.push(mention)
		end = mention.index + mention.match.length
	}
	return result
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export type Temperature = {
	f: number
	c: number
	/** "205°F · 96°C" */
	label: string
}

export function fahrenheitToCelsius(f: number): number {
	return ((f - 32) * 5) / 9
}

/** Brewing temps are logged in °F; returns both scales, rounded to whole degrees. */
export function formatTemp(fahrenheit: number | null | undefined): Temperature | null {
	if (fahrenheit == null || !Number.isFinite(fahrenheit)) return null
	const f = Math.round(fahrenheit)
	const c = Math.round(fahrenheitToCelsius(fahrenheit))
	return { f, c, label: `${f}°F · ${c}°C` }
}

/** Leaf-to-water ratio, e.g. ratio(5.34, 110) → "1:20.6". Null when either side is missing/zero. */
export function ratio(grams: number | null | undefined, ml: number | null | undefined): string | null {
	if (!grams || !ml || grams <= 0 || ml <= 0) return null
	const r = ml / grams
	return `1:${Number.isInteger(r) ? r : r.toFixed(1)}`
}

/** 8 → "8s", 75 → "1:15", 3600 → "60:00" */
export function formatSeconds(seconds: number): string {
	const s = Math.max(0, Math.round(seconds))
	if (s < 60) return `${s}s`
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** "1st", "2nd", "3rd", "11th"; 0 → "rinse" */
export function ordinal(n: number): string {
	if (n === 0) return "rinse"
	const mod100 = n % 100
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`
	return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}
