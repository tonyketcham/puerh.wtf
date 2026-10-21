/**
 * Tasting-note descriptors: turn free-text notes ("nutmeg, marzipan, raspberry and dulce de leche")
 * into normalized descriptor phrases, and find which sessions mention a descriptor
 * ("find references"). Pure module, safe on server and client.
 */
import { NOTE_STAGES, type NoteStage, type SessionNotes } from "@/lib/types/session"

export type Descriptor = {
	/** normalized phrase, lowercase, e.g. "dark chocolate" */
	term: string
	/** note stages it appeared in, in tasting order */
	stages: NoteStage[]
}

/** Where a descriptor match was found in a session */
export type DescriptorField = NoteStage | "excerpt"

export type DescriptorMatch = {
	field: DescriptorField
	/** full text of that field */
	text: string
	/** offset + length of the match within `text` */
	index: number
	length: number
}

type NotesLike = Partial<Record<NoteStage, string | null | undefined>> | null | undefined

/** Anything with notes and/or an excerpt (SessionFull, ExplorerSession, …) */
export type DescriptorSearchable = {
	notes?: NotesLike | Partial<SessionNotes>
	excerpt?: string | null
}

/** Hard separators between list items */
const SPLIT_HARD = /[,;|\n]|\.(?:\s|$)/
/** Soft connectors inside a list item ("dates and stone fruits", "malt with berries") */
const SPLIT_SOFT = /\s\+\s|\s&\s|\b(?:and|with|or|plus|then)\b/i

const LEADING_FILLER =
	/^(?:(?:a|an|the|some|lots of|lot of|hints? of|notes? of|touch of|bits? of|a bit of|a little|kind of|sort of|like|very|really|super|quite|incredibly|slightly|somewhat|mildly|maybe|perhaps|possibly|also|more|less|light hint of|faint)\s+)+/i

const STOP_TERMS = new Set([
	"",
	"etc",
	"more",
	"less",
	"some",
	"stuff",
	"things",
	"it",
	"that",
	"this",
	"then",
	"also",
	"other",
	"others",
	"maybe",
	"lots",
	"bit",
])

/** Phrases longer than this are prose, not descriptors */
const MAX_WORDS = 4

export function normalizeDescriptor(raw: string): string {
	let t = raw
		.toLowerCase()
		.replace(/\([^)]*\)/g, " ") // parentheticals
		.replace(/["“”‘’`]/g, "")
		.replace(/\s+/g, " ")
		.trim()
	t = t.replace(LEADING_FILLER, "")
	t = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
	return t.trim()
}

/** Splits one note field into normalized descriptor phrases (deduped, in order). */
export function splitDescriptors(text: string | null | undefined): string[] {
	if (!text) return []
	const seen = new Set<string>()
	const out: string[] = []
	for (const chunk of text.split(SPLIT_HARD)) {
		// a long clause is prose ("a gentle calm moving out from the stomach…"), not a list item:
		// skip it whole rather than keep fragments like "mind"
		if (chunk.trim().split(/\s+/).length > MAX_WORDS * 2) continue
		for (const part of chunk.split(SPLIT_SOFT)) {
			const term = normalizeDescriptor(part)
			if (term.length < 2 || STOP_TERMS.has(term)) continue
			if (term.split(" ").length > MAX_WORDS) continue
			if (seen.has(term)) continue
			seen.add(term)
			out.push(term)
		}
	}
	return out
}

/**
 * Unique descriptor phrases across all note stages, in tasting order (dry leaf → cha qi),
 * each tagged with the stages it appeared in.
 */
export function extractDescriptors(notes: NotesLike | Partial<SessionNotes>): Descriptor[] {
	if (!notes) return []
	const byTerm = new Map<string, Descriptor>()
	for (const stage of NOTE_STAGES) {
		const value = (notes as NotesLike)?.[stage]
		for (const term of splitDescriptors(value)) {
			const existing = byTerm.get(term)
			if (existing) {
				if (!existing.stages.includes(stage)) existing.stages.push(stage)
			} else {
				byTerm.set(term, { term, stages: [stage] })
			}
		}
	}
	return [...byTerm.values()]
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Last-word plural tolerance: raspberry ⇄ raspberries, plum ⇄ plums, peach ⇄ peaches */
function pluralTolerant(word: string): string {
	if (word.length < 3) return escapeRegExp(word)
	if (/ies$/.test(word)) return `${escapeRegExp(word.slice(0, -3))}(?:y|ies)`
	if (/[^aeiou]y$/.test(word)) return `${escapeRegExp(word.slice(0, -1))}(?:y|ies)`
	if (/(?:ch|sh|x|ss)es$/.test(word)) return `${escapeRegExp(word.slice(0, -2))}(?:es)?`
	if (/[^s]s$/.test(word)) return `${escapeRegExp(word.slice(0, -1))}s?`
	if (/(?:ch|sh|x|ss)$/.test(word)) return `${escapeRegExp(word)}(?:es)?`
	return `${escapeRegExp(word)}s?`
}

/**
 * Case-insensitive, word-boundary (unicode-aware), whitespace-flexible, plural-tolerant regex
 * for a descriptor. Default flags "giu". Returns null for an empty term.
 */
export function descriptorRegex(term: string, flags = "giu"): RegExp | null {
	const words = normalizeDescriptor(term).split(" ").filter(Boolean)
	if (!words.length) return null
	const last = words.length - 1
	const body = words.map((w, i) => (i === last ? pluralTolerant(w) : escapeRegExp(w))).join("[\\s-]+")
	return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags)
}

function fieldsOf(session: DescriptorSearchable): [DescriptorField, string][] {
	const fields: [DescriptorField, string][] = []
	const notes = session.notes as NotesLike
	if (notes) {
		for (const stage of NOTE_STAGES) {
			const v = notes[stage]
			if (v) fields.push([stage, v])
		}
	}
	if (session.excerpt) fields.push(["excerpt", session.excerpt])
	return fields
}

/** Every occurrence of `descriptor` in a session's notes + excerpt. */
export function findDescriptorMatches(
	session: DescriptorSearchable,
	descriptor: string
): DescriptorMatch[] {
	const re = descriptorRegex(descriptor)
	if (!re) return []
	const out: DescriptorMatch[] = []
	for (const [field, text] of fieldsOf(session)) {
		re.lastIndex = 0
		for (const m of text.matchAll(re)) {
			out.push({ field, text, index: m.index ?? 0, length: m[0].length })
		}
	}
	return out
}

/** True if the session's notes or excerpt mention the descriptor (word-boundary, case-insensitive). */
export function sessionMatchesDescriptor(session: DescriptorSearchable, descriptor: string): boolean {
	const re = descriptorRegex(descriptor, "iu")
	if (!re) return false
	return fieldsOf(session).some(([, text]) => re.test(text))
}
