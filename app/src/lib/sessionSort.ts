/**
 * Explorer sort orders for the session list. Pure: safe in server code and tests.
 * Every order is newest/best first and falls back to the session date, so ties stay stable.
 */
import type { ExplorerSession } from "@/lib/types/session"

export const SESSION_SORTS = ["date", "vintage", "rating"] as const
export type SessionSort = typeof SESSION_SORTS[number]

export const SESSION_SORT_LABEL: Record<SessionSort, string> = {
	date: "date",
	vintage: "vintage",
	rating: "rating",
}

export const isSessionSort = (value: unknown): value is SessionSort =>
	typeof value === "string" && (SESSION_SORTS as readonly string[]).includes(value)

const time = (s: Pick<ExplorerSession, "date">) => {
	const t = s.date ? new Date(s.date).getTime() : NaN
	return Number.isFinite(t) ? t : -Infinity
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : -Infinity)

type Sortable = Pick<ExplorerSession, "date" | "production_year" | "rating">

/** Comparator for a sort order (descending; unknown values last). */
export function compareSessions(sort: SessionSort) {
	return (a: Sortable, b: Sortable) => {
		if (sort === "rating") return num(b.rating) - num(a.rating) || time(b) - time(a)
		if (sort === "vintage")
			return num(Number(b.production_year)) - num(Number(a.production_year)) || time(b) - time(a)
		return time(b) - time(a)
	}
}

/** A sorted copy (the input is left alone). */
export function sortSessions<T extends Sortable>(sessions: readonly T[], sort: SessionSort): T[] {
	return [...sessions].sort(compareSessions(sort))
}

/** A rating as written in the log: up to two decimals, no trailing zeros (90, 89.96, 84.5). */
export function formatRating(rating: number): string {
	return String(Math.round(rating * 100) / 100)
}
