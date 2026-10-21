/**
 * The home page's log: recent sessions grouped by the month they were drunk, each month laid out
 * as a 6-column shelf whose slot sizes come from the sessions themselves, plus the margin notes
 * and quiet stretches that make it read like a log rather than a feed.
 */
import { flavorCentroid, sessionColor } from "./relations"
import type { ExplorerSession, SessionFlavorAxes } from "./types/session"
import type { SessionCardVariant } from "./components/SessionCard"

const DAY = 86_400_000

/** columns a slot takes on the 6-column shelf */
export type LogSpan = 2 | 4 | 6

export type LogSlot = {
	session: ExplorerSession
	span: LogSpan
	/** columns on the 2-column shelf (mid widths) */
	half: 1 | 2
	variant: SessionCardVariant
	note: string | null
}

export type LogMonth = {
	/** "2022-07" */
	key: string
	year: number
	/** 1–12 */
	month: number
	slots: LogSlot[]
	count: number
	avgRating: number | null
	liquors: string[]
	centroid: SessionFlavorAxes | null
	/** days without a session between this month's first entry and the newer month above it */
	quietBefore: number | null
}

const time = (s: ExplorerSession) => new Date(s.date).getTime()

/** A session earns a wide slot by scoring high or having more to say. */
const isBig = (s: ExplorerSession) => (s.rating ?? 0) >= 90 || (s.excerpt?.length ?? 0) >= 60

/**
 * Slot sizes for one month: wide (4) when the session earns it and the row has room, else 2;
 * the last slot stretches to close its row, so every month ends flush.
 */
export function shelfSpans(sessions: readonly ExplorerSession[]): LogSpan[] {
	const spans: LogSpan[] = []
	let used = 0
	for (const s of sessions) {
		const room = 6 - used
		const span: LogSpan = isBig(s) && room >= 4 ? 4 : 2
		spans.push(span)
		used = (used + span) % 6
	}
	if (used && spans.length) spans[spans.length - 1] = (spans[spans.length - 1] + 6 - used) as LogSpan
	return spans
}

/**
 * The same shelf folded to 2 columns. Rows of the 6-column shelf are [6], [2,4], [4,2] or
 * [2,2,2]: a full row stays full, the pairs sit side by side, and the third of three takes a
 * row of its own, so no month leaves a hole.
 */
export function halfSpans(spans: readonly LogSpan[]): (1 | 2)[] {
	const half: (1 | 2)[] = []
	let row = 0
	let used = 0
	for (const span of spans) {
		half.push(span === 6 || row === 2 ? 2 : 1)
		used += span
		row++
		if (used >= 6) used = row = 0
	}
	return half
}

const variantFor = (span: LogSpan): SessionCardVariant =>
	span === 2 ? "tile" : span === 4 ? "wide" : "row"

const normTitle = (title: string) =>
	title
		.toLowerCase()
		.replace(/\b(19|20)\d{2}\b/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()

const stamp = (date: string) => date.slice(0, 10).replace(/-/g, ".")

function since(days: number): string {
	const months = Math.round(days / 30.44)
	if (months < 24) return `${months} months`
	return `${Math.round(days / 365.2425)} years`
}

/**
 * A margin note for a session, from everything logged before it (`older`, newest first):
 * the same tea again, or a kind of tea that hasn't come up in a while.
 */
export function sessionNote(session: ExplorerSession, older: readonly ExplorerSession[]): string | null {
	const title = normTitle(session.title)
	const again = title && older.find((o) => normTitle(o.title) === title)
	if (again) return `again · last steeped ${stamp(again.date)}`

	const category = session.style?.[0]?.category
	if (!category) return null
	const prev = older.find((o) => o.style?.[0]?.category?._slug === category._slug)
	const name = category.title.toLowerCase()
	if (!prev) return older.length ? `first ${name} in the log` : null
	const gap = (time(session) - time(prev)) / DAY
	return gap >= 120 ? `first ${name} in ${since(gap)}` : null
}

/** The newest `limit` sessions as months, the very newest as the hero. */
export function buildSessionLog(sessions: readonly ExplorerSession[], limit: number): LogMonth[] {
	const all = [...sessions].sort((a, b) => time(b) - time(a))
	const recent = all.slice(0, limit)

	const months: LogMonth[] = []
	for (const [i, s] of recent.entries()) {
		const key = s.date.slice(0, 7)
		let month = months[months.length - 1]
		if (month?.key !== key) {
			const above = recent[i - 1]
			month = {
				key,
				year: Number(key.slice(0, 4)),
				month: Number(key.slice(5, 7)),
				slots: [],
				count: 0,
				avgRating: null,
				liquors: [],
				centroid: null,
				quietBefore: above ? Math.floor((time(above) - time(s)) / DAY) : null,
			}
			months.push(month)
		}
		month.slots.push({
			session: s,
			span: 6,
			half: 2,
			variant: i === 0 ? "hero" : "row",
			note: sessionNote(s, all.slice(i + 1)),
		})
	}

	for (const month of months) {
		const shelf = month.slots.filter((slot) => slot.variant !== "hero")
		const spans = shelfSpans(shelf.map((slot) => slot.session))
		const half = halfSpans(spans)
		spans.forEach((span, i) => {
			shelf[i].span = span
			shelf[i].half = half[i]
			shelf[i].variant = variantFor(span)
		})
		const list = month.slots.map((slot) => slot.session)
		const ratings = list.map((s) => s.rating).filter((r): r is number => typeof r === "number")
		month.count = list.length
		month.avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
		month.liquors = list.map(sessionColor)
		month.centroid = flavorCentroid(list)
	}
	return months
}
