/**
 * The flavor lexicon (plan §2.2 "Flavor descriptor", §3.3 "/lexicon"): every word the tasting
 * notes use, folded across plurals ("plum" and "plums" are one word), counted by the sessions
 * that list it, and placed into the radar's ten flavor axes (plus texture and qi, the words
 * that aren't flavors). Words listed in two or more sessions get a page, /lexicon/[slug]/.
 *
 * Built from the same session list as the relation index, so the server (static params, the
 * index's reference counts) and the client (peeks, the Properties panel) agree on every word.
 * Pure module (no React), safe on server and client.
 */
import {
	extractDescriptors,
	findDescriptorMatches,
	normalizeDescriptor,
	sessionMatchesDescriptor,
	type DescriptorMatch,
} from "@/lib/descriptors"
import { LEXICON_AXIS_MAP, type LexiconMappedGroup } from "@/lib/lexiconAxes"
import {
	FLAVOR_AXES,
	NOTE_STAGES,
	type ExplorerSession,
	type FlavorAxis,
	type NoteStage,
} from "@/lib/types/session"

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export type LexiconGroup = FlavorAxis | "texture" | "qi" | "uncategorized"

/** Periodic-table order: the radar's axes, then the words that aren't flavors. */
export const LEXICON_GROUPS: readonly LexiconGroup[] = [
	...FLAVOR_AXES,
	"texture",
	"qi",
	"uncategorized",
]

export const LEXICON_GROUP_META: Record<
	LexiconGroup,
	{ symbol: string; label: string; blurb: string }
> = {
	vegetal: { symbol: "Vg", label: "vegetal", blurb: "green, leafy, herbal" },
	floral: { symbol: "Fl", label: "floral", blurb: "blossom, perfume, clean laundry" },
	fruits: { symbol: "Fr", label: "fruits", blurb: "stone fruit, berries, citrus, jam" },
	spices: { symbol: "Sp", label: "spices", blurb: "the spice rack" },
	wood: { symbol: "Wd", label: "wood", blurb: "timber, resin, smoke, tobacco" },
	earth: { symbol: "Ea", label: "earth", blurb: "soil, rain, forest floor, leather" },
	nuts_roast: { symbol: "Nr", label: "nuts & roast", blurb: "nuts, cacao, grain, the oven" },
	cream: { symbol: "Cr", label: "cream", blurb: "dairy and the confectioner's shelf" },
	stone: { symbol: "St", label: "stone", blurb: "minerals, rock, flint" },
	umami: { symbol: "Um", label: "umami", blurb: "savory, marine, fermented" },
	texture: { symbol: "Tx", label: "texture", blurb: "mouthfeel and finish" },
	qi: { symbol: "Qi", label: "qi", blurb: "how it sits in the body" },
	uncategorized: { symbol: "··", label: "uncategorized", blurb: "not sorted yet" },
}

/** A word gets a page once this many sessions list it (plan §2.3). */
export const LEXICON_MIN_SESSIONS = 2

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LexiconEntry = {
	/** the word, in its singular spelling when the notes use one */
	term: string
	/** URL segment of its page */
	slug: string
	/** every spelling the notes use, most used first */
	spellings: string[]
	/** sessions whose notes list the word (any spelling), newest first */
	listed: string[]
	/** per note stage, how many sessions list it there */
	stages: Record<NoteStage, number>
	group: LexiconGroup
	/** how it was placed: the mapping file, a word of it, the stages it's said in, or not at all */
	via: "map" | "word" | "stage" | "none"
}

export type Lexicon = {
	/** every word, most listed first */
	entries: LexiconEntry[]
	/** the words with pages (listed in ≥ LEXICON_MIN_SESSIONS sessions), most listed first */
	paged: LexiconEntry[]
	/** paged words by slug */
	bySlug: ReadonlyMap<string, LexiconEntry>
	/** every spelling → its word */
	bySpelling: ReadonlyMap<string, LexiconEntry>
	/** distinct words across the log */
	size: number
}

/** Sessions as the lexicon reads them (ExplorerSession and friends). */
type LexiconSession = Pick<ExplorerSession, "_slug" | "notes" | "excerpt">

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const cache = new WeakMap<readonly LexiconSession[], Lexicon>()

/** The lexicon of a session list, built once per list (the relation index's sessions). */
export function lexiconOf(sessions: readonly LexiconSession[]): Lexicon {
	let hit = cache.get(sessions)
	if (!hit) {
		hit = buildLexicon(sessions)
		cache.set(sessions, hit)
	}
	return hit
}

/** Counts that aren't words: "2nd", "3 steeps". Two letters say nothing ("ok"). */
const isWord = (term: string) => term.length >= 3 && !/^\d/.test(term)

export function buildLexicon(sessions: readonly LexiconSession[]): Lexicon {
	// spelling → the sessions listing it, and at which stages
	const spelled = new Map<string, { sessions: Set<string>; stages: Map<NoteStage, Set<string>> }>()
	for (const s of sessions) {
		for (const d of extractDescriptors(s.notes)) {
			if (!isWord(d.term)) continue
			let entry = spelled.get(d.term)
			if (!entry) {
				entry = { sessions: new Set(), stages: new Map() }
				spelled.set(d.term, entry)
			}
			entry.sessions.add(s._slug)
			for (const stage of d.stages) {
				const set = entry.stages.get(stage) ?? new Set<string>()
				set.add(s._slug)
				entry.stages.set(stage, set)
			}
		}
	}

	// fold plurals onto the singular the notes also use: plums → plum, cherries → cherry
	const groups = new Map<string, string[]>()
	for (const spelling of spelled.keys()) {
		const term = singularIn(spelling, spelled) ?? spelling
		const list = groups.get(term) ?? []
		list.push(spelling)
		groups.set(term, list)
	}

	const order = new Map(sessions.map((s, i) => [s._slug, i] as const))
	const entries: LexiconEntry[] = []
	for (const [term, spellingList] of groups) {
		const listedSet = new Set<string>()
		const stageSets = new Map<NoteStage, Set<string>>()
		for (const sp of spellingList) {
			const e = spelled.get(sp)!
			for (const slug of e.sessions) listedSet.add(slug)
			for (const [stage, set] of e.stages) {
				const acc = stageSets.get(stage) ?? new Set<string>()
				for (const slug of set) acc.add(slug)
				stageSets.set(stage, acc)
			}
		}
		const stages = Object.fromEntries(
			NOTE_STAGES.map((stage) => [stage, stageSets.get(stage)?.size ?? 0])
		) as Record<NoteStage, number>
		const spellings = [...spellingList].sort(
			(a, b) =>
				spelled.get(b)!.sessions.size - spelled.get(a)!.sessions.size ||
				Number(b === term) - Number(a === term) ||
				a.localeCompare(b)
		)
		const { group, via } = classify(term, spellings, stages)
		entries.push({
			term,
			slug: "",
			spellings,
			listed: [...listedSet].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
			stages,
			group,
			via,
		})
	}
	entries.sort((a, b) => b.listed.length - a.listed.length || a.term.localeCompare(b.term))

	// slugs: unique, assigned in rank order so the common word keeps the plain one
	const taken = new Set<string>()
	const bySlug = new Map<string, LexiconEntry>()
	const bySpelling = new Map<string, LexiconEntry>()
	for (const entry of entries) {
		const base = lexiconSlug(entry.term)
		let slug = base
		for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
		taken.add(slug)
		entry.slug = slug
		for (const sp of entry.spellings) bySpelling.set(sp, entry)
	}
	const paged = entries.filter((e) => e.listed.length >= LEXICON_MIN_SESSIONS)
	for (const entry of paged) bySlug.set(entry.slug, entry)

	return { entries, paged, bySlug, bySpelling, size: entries.length }
}

/**
 * The singular spelling of a plural that the notes also use, if any: the last word loses its
 * -s / -es / -ies (→ -y). Only spellings that exist count, so "molasses" stays whole.
 */
function singularIn(spelling: string, known: ReadonlyMap<string, unknown>): string | null {
	const cut = spelling.lastIndexOf(" ") + 1
	const head = spelling.slice(0, cut)
	const word = spelling.slice(cut)
	if (word.length < 4 || !word.endsWith("s") || word.endsWith("ss")) return null
	const candidates = [word.slice(0, -1)]
	if (word.endsWith("es")) candidates.push(word.slice(0, -2))
	if (word.endsWith("ies")) candidates.push(`${word.slice(0, -3)}y`)
	for (const c of candidates) if (known.has(head + c)) return head + c
	return null
}

/** URL segment for a word: "dark chocolate" → dark-chocolate, "crème brûlée" → creme-brulee. */
export function lexiconSlug(term: string): string {
	return (
		term
			.normalize("NFD")
			.replace(/\p{M}+/gu, "")
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "") || "word"
	)
}

/** Page of a word (trailing slash, matching `trailingSlash: true`). */
export const lexiconHref = (slug: string) => `/lexicon/${encodeURIComponent(slug)}/`

/** The lexicon index, at a group's band. */
export const lexiconGroupHref = (group: LexiconGroup) => `/lexicon/#${group}`

/** The word behind any spelling of it ("Plums", "plum"), or null. */
export function findLexiconEntry(lexicon: Lexicon, term: string): LexiconEntry | null {
	const t = normalizeDescriptor(term)
	const hit = lexicon.bySpelling.get(t)
	if (hit) return hit
	// a spelling the notes never use: try its singular / plural
	const cut = t.lastIndexOf(" ") + 1
	const head = t.slice(0, cut)
	const word = t.slice(cut)
	const variants = [`${word}s`, `${word}es`, word.replace(/y$/, "ies"), word.replace(/e?s$/, "")]
	for (const v of variants) {
		const e = lexicon.bySpelling.get(head + v)
		if (e) return e
	}
	return null
}

/** The page a peeked descriptor opens, when the word has one. */
export function lexiconPageOf(
	sessions: readonly LexiconSession[],
	term: string
): LexiconEntry | null {
	const lexicon = lexiconOf(sessions)
	const entry = findLexiconEntry(lexicon, term)
	return entry && lexicon.bySlug.get(entry.slug) === entry ? entry : null
}

// ---------------------------------------------------------------------------
// Placing words
// ---------------------------------------------------------------------------

/**
 * A forgiving stem for matching against the mapping file: plurals and -y adjectives fold
 * (berries, berry → berr; smoky, smoke → smok; creamy → cream). Only ever compared to itself.
 */
function stem(word: string): string {
	if (/(?:ss|us|is)$/.test(word)) return word
	const cut = word.replace(/(?:ies|ie|es|e|y|s)$/, "")
	return cut.length >= 3 ? cut : word
}

const stemPhrase = (phrase: string) => {
	const words = normalizeDescriptor(phrase).split(" ").filter(Boolean)
	if (!words.length) return ""
	words[words.length - 1] = stem(words[words.length - 1])
	return words.join(" ")
}

let mapIndex: Map<string, LexiconMappedGroup> | null = null

function mapped(phrase: string): LexiconMappedGroup | null {
	if (!mapIndex) {
		mapIndex = new Map()
		for (const [group, words] of Object.entries(LEXICON_AXIS_MAP) as [
			LexiconMappedGroup,
			readonly string[]
		][]) {
			for (const w of words) {
				const key = stemPhrase(w)
				if (key && !mapIndex.has(key)) mapIndex.set(key, group)
			}
		}
	}
	return mapIndex.get(stemPhrase(phrase)) ?? null
}

function classify(
	term: string,
	spellings: readonly string[],
	stages: Record<NoteStage, number>
): { group: LexiconGroup; via: LexiconEntry["via"] } {
	for (const sp of [term, ...spellings]) {
		const group = mapped(sp)
		if (group) return { group, via: "map" }
	}
	const words = term.split(" ")
	if (words.length > 1) {
		const group = mapped(words[words.length - 1]) ?? mapped(words[0])
		if (group) return { group, via: "word" }
	}
	const total = NOTE_STAGES.reduce((n, s) => n + stages[s], 0)
	if (total) {
		if (stages.cha_qi / total >= 0.5) return { group: "qi", via: "stage" }
		if ((stages.mouthfeel + stages.finish) / total >= 0.6) return { group: "texture", via: "stage" }
	}
	return { group: "uncategorized", via: "none" }
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/**
 * Find all references: every session whose notes or excerpt mention the word in any spelling
 * (word-boundary, plural-tolerant, like the descriptor peek), in the given order. A superset
 * of `listed`: "honey" also turns up in "wildflower honey" and in excerpts.
 */
export function lexiconRefs<S extends LexiconSession>(
	sessions: readonly S[],
	entry: LexiconEntry
): S[] {
	const listed = new Set(entry.listed)
	return sessions.filter(
		(s) => listed.has(s._slug) || entry.spellings.some((sp) => sessionMatchesDescriptor(s, sp))
	)
}

/** Each mention of the word in one session, in field order, overlapping spellings merged. */
export function lexiconMatches(session: LexiconSession, entry: LexiconEntry): DescriptorMatch[] {
	const seen = new Set<string>()
	const out: DescriptorMatch[] = []
	for (const sp of entry.spellings) {
		for (const m of findDescriptorMatches(session, sp)) {
			const key = `${m.field}:${m.index}`
			if (seen.has(key)) continue
			seen.add(key)
			out.push(m)
		}
	}
	const rank = (f: DescriptorMatch["field"]) =>
		f === "excerpt" ? -1 : NOTE_STAGES.indexOf(f as NoteStage)
	return out.sort((a, b) => rank(a.field) - rank(b.field) || a.index - b.index)
}

export type LexiconCompanion = { entry: LexiconEntry; shared: number }

/**
 * The words it keeps company with: paged words listed in the same sessions, by how many
 * sessions they share (at least two), then by how exclusive the pairing is.
 */
export function lexiconCompanions(
	lexicon: Lexicon,
	entry: LexiconEntry,
	limit = 10
): LexiconCompanion[] {
	const mine = new Set(entry.listed)
	const out: (LexiconCompanion & { jaccard: number })[] = []
	for (const other of lexicon.paged) {
		if (other === entry) continue
		let shared = 0
		for (const slug of other.listed) if (mine.has(slug)) shared++
		if (shared < 2) continue
		const jaccard = shared / (mine.size + other.listed.length - shared)
		out.push({ entry: other, shared, jaccard })
	}
	return out
		.sort(
			(a, b) =>
				b.shared - a.shared || b.jaccard - a.jaccard || a.entry.term.localeCompare(b.entry.term)
		)
		.slice(0, limit)
		.map(({ entry: e, shared }) => ({ entry: e, shared }))
}

/** The stage a word is most said at (ties go to the earlier stage), or null. */
export function peakStage(entry: LexiconEntry): NoteStage | null {
	let best: NoteStage | null = null
	for (const stage of NOTE_STAGES) {
		if (entry.stages[stage] > (best ? entry.stages[best] : 0)) best = stage
	}
	return best
}
