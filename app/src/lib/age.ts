/**
 * Age helpers: how old the leaf is (vintage) and how long ago the session was.
 *
 * Both depend on "now". In a statically exported page the server's now is build time, so
 * compute these on the client (in an effect / after mount) or pass `now` explicitly to keep
 * server and client renders identical.
 */

const MS_PER_DAY = 86_400_000
const DAYS_PER_YEAR = 365.2425

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function toDate(value: string | number | Date | null | undefined): Date | null {
	if (value == null || value === "") return null
	const d = value instanceof Date ? value : new Date(value)
	return Number.isNaN(d.getTime()) ? null : d
}

/** Fractional year of a date: 2026-07-02 → ~2026.5 */
function fractionalYear(d: Date): number {
	const start = Date.UTC(d.getUTCFullYear(), 0, 1)
	const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1)
	return d.getUTCFullYear() + (d.getTime() - start) / (end - start)
}

/**
 * Years since the leaf was produced (fractional, ≥ 0), assuming mid-year production
 * (spring harvest, pressed later). Null when production_year is unknown.
 */
export function vintageAgeYears(
	productionYear: number | null | undefined,
	now: Date = new Date()
): number | null {
	if (productionYear == null || !Number.isFinite(productionYear)) return null
	const year = Number.isInteger(productionYear) ? productionYear + 0.5 : productionYear
	return Math.max(0, fractionalYear(now) - year)
}

/** Leaf age at the time of the session (years, ≥ 0). */
export function vintageAgeAtSession(
	productionYear: number | null | undefined,
	sessionDate: string | Date | null | undefined
): number | null {
	const d = toDate(sessionDate)
	return d ? vintageAgeYears(productionYear, d) : null
}

/** Whole days since the session date (≥ 0). Null when the date is missing/invalid. */
export function sessionAgeDays(
	date: string | number | Date | null | undefined,
	now: Date = new Date()
): number | null {
	const d = toDate(date)
	if (!d) return null
	return Math.max(0, Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY))
}

/**
 * 0..1 "how aged is this leaf": eased so the first decade matters most
 * (0y → 0, 5y → ~0.52, 10y → ~0.70, 20y → ~0.89, ≥30y → 1).
 */
export function vintageAgeFactor(years: number | null | undefined, maxYears = 30): number {
	if (years == null || years <= 0) return 0
	return clamp01(Math.log1p(years) / Math.log1p(maxYears))
}

/**
 * 0..1 "how long ago was this session": 0 = today, 1 = ≥ maxDays ago (default 4 years).
 * Square-root eased so recent weeks are distinguishable.
 */
export function sessionAgeFactor(days: number | null | undefined, maxDays = DAYS_PER_YEAR * 4): number {
	if (days == null || days <= 0) return 0
	return clamp01(Math.sqrt(days / maxDays))
}

/** "today", "3 days ago", "5 weeks ago", "2 years ago" */
export function formatRelativeDays(days: number | null | undefined): string {
	if (days == null) return ""
	if (days < 1) return "today"
	if (days < 2) return "yesterday"
	if (days < 14) return `${days} days ago`
	if (days < 60) return `${Math.round(days / 7)} weeks ago`
	if (days < DAYS_PER_YEAR * 1.5) return `${Math.round(days / 30.44)} months ago`
	return `${Math.round(days / DAYS_PER_YEAR)} years ago`
}

/** "12 yrs", "8 mo", "new" */
export function formatVintageAge(years: number | null | undefined): string {
	if (years == null) return ""
	if (years < 1 / 12) return "new"
	if (years < 1) return `${Math.round(years * 12)} mo`
	return `${Math.round(years)} ${Math.round(years) === 1 ? "yr" : "yrs"}`
}
