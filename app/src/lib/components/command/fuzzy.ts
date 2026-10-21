/**
 * Tiny fuzzy matcher for the command bar.
 *
 * - Contiguous substring matches win (with a bonus when they start on a word boundary).
 * - Otherwise falls back to an in-order subsequence that prefers word starts and runs of
 *   consecutive characters; spread-out "garbage" subsequences are rejected.
 * - Multi-token queries ("yiwu 2018") require every token to match some field.
 *
 * Returns matched character indices so rows can highlight them.
 */

export type FuzzyResult = {
	score: number
	/** matched character indices in the target */
	indices: number[]
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

function isBoundary(text: string, i: number) {
	if (i === 0) return true
	const prev = text[i - 1]
	const cur = text[i]
	if (!isWordChar(prev)) return true
	// camelCase / digit-letter transitions
	return /\p{Ll}/u.test(prev) && /\p{Lu}/u.test(cur)
}

export function fuzzyMatch(query: string, target: string | null | undefined): FuzzyResult | null {
	if (!target) return null
	const q = query.toLowerCase()
	if (!q) return { score: 0, indices: [] }
	const t = target.toLowerCase()
	// toLowerCase can change length for a handful of code points; bail to substring-only then
	const safe = t.length === target.length

	// 1. substring: prefer the first occurrence that starts a word
	let at = -1
	let from = 0
	let first = -1
	while ((from = t.indexOf(q, from)) !== -1) {
		if (first === -1) first = from
		if (isBoundary(target, from)) {
			at = from
			break
		}
		from += 1
	}
	if (at === -1) at = first
	if (at !== -1) {
		const boundary = isBoundary(target, at)
		const exact = q.length === t.length
		const score =
			100 + q.length * 6 + (boundary ? 40 : 0) + (exact ? 60 : 0) + (at === 0 ? 20 : 0) - at * 0.5
		return { score, indices: Array.from({ length: q.length }, (_, k) => at + k) }
	}
	if (!safe || q.length < 2) return null

	// 2. subsequence (greedy, but jump ahead to a word start when one is available)
	const indices: number[] = []
	let score = 0
	let ti = 0
	for (let qi = 0; qi < q.length; qi++) {
		const ch = q[qi]
		if (ch === " ") continue
		let found = -1
		// prefer a boundary occurrence if the previous char wasn't consecutive
		const prevIdx = indices.length ? indices[indices.length - 1] : -2
		if (t[ti] === ch) found = ti
		else {
			let firstAny = -1
			for (let k = ti; k < t.length; k++) {
				if (t[k] !== ch) continue
				if (firstAny === -1) firstAny = k
				if (isBoundary(target, k)) {
					found = k
					break
				}
			}
			if (found === -1) found = firstAny
		}
		if (found === -1) return null
		const consecutive = found === prevIdx + 1
		score += 2 + (consecutive ? 6 : 0) + (isBoundary(target, found) ? 8 : 0)
		indices.push(found)
		ti = found + 1
	}
	const span = indices[indices.length - 1] - indices[0] + 1
	// spread-out matches are noise, unless every char starts a word (an acronym: "otyw")
	const acronym = indices.every((i) => isBoundary(target, i))
	if (!acronym && span > q.length * 3 + 6) return null
	if (acronym) score += 10
	score -= (span - indices.length) * 1.5
	score -= indices[0] * 0.3
	return { score: Math.max(1, score), indices }
}

export type FuzzyField = {
	text: string | null | undefined
	/** relative weight; the primary label should be 1 */
	weight?: number
	/** collect highlight indices for this field */
	key?: string
}

export type MultiResult = {
	score: number
	/** matched indices per field key */
	highlights: Record<string, number[]>
}

export function tokenize(query: string): string[] {
	return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * Every token must match one of the fields. Each token takes its best field; highlight indices
 * are collected for fields that declare a `key`. A whole-query match on the first field gets a
 * bonus so "old tree yiwu" prefers a title containing that exact phrase.
 */
export function fuzzyFields(query: string, fields: FuzzyField[]): MultiResult | null {
	const tokens = tokenize(query)
	if (!tokens.length) return { score: 0, highlights: {} }
	const highlights: Record<string, number[]> = {}
	let total = 0

	if (tokens.length > 1 && fields[0]?.text) {
		const whole = fuzzyMatch(tokens.join(" "), fields[0].text)
		if (whole && whole.score >= 100) {
			if (fields[0].key) highlights[fields[0].key] = whole.indices
			return { score: whole.score * (fields[0].weight ?? 1) + 50, highlights }
		}
	}

	for (const token of tokens) {
		let best: { score: number; field: FuzzyField; indices: number[] } | null = null
		for (const field of fields) {
			const r = fuzzyMatch(token, field.text)
			if (!r) continue
			const s = r.score * (field.weight ?? 1)
			if (!best || s > best.score) best = { score: s, field, indices: r.indices }
		}
		if (!best) return null
		total += best.score
		if (best.field.key) {
			const list = (highlights[best.field.key] ||= [])
			for (const i of best.indices) if (!list.includes(i)) list.push(i)
		}
	}
	return { score: total / tokens.length, highlights }
}
