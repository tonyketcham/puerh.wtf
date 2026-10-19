/**
 * Recently opened command-bar items, per viewer (localStorage). Every access is guarded:
 * storage can be missing or throw (private mode, blocked site data), and the bar must work
 * without it.
 */

export type RecentKind =
	| "tea"
	| "flavor"
	| "vendor"
	| "style"
	| "category"
	| "origin"
	| "cultivar"
	| "vessel"
	| "tag"
	| "year"

export type RecentEntry = { kind: RecentKind; id: string }

const KEY = "puerh.commandbar.recents"
const MAX = 6

export function readRecents(): RecentEntry[] {
	try {
		const raw = window.localStorage.getItem(KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed
			.filter(
				(e): e is RecentEntry =>
					!!e && typeof e.kind === "string" && typeof e.id === "string" && !!e.id
			)
			.slice(0, MAX)
	} catch {
		return []
	}
}

export function pushRecent(entry: RecentEntry): RecentEntry[] {
	const next = [
		entry,
		...readRecents().filter((e) => !(e.kind === entry.kind && e.id === entry.id)),
	].slice(0, MAX)
	try {
		window.localStorage.setItem(KEY, JSON.stringify(next))
	} catch {
		// storage unavailable: recents just won't persist
	}
	return next
}

export function clearRecents() {
	try {
		window.localStorage.removeItem(KEY)
	} catch {
		// ignore
	}
}
