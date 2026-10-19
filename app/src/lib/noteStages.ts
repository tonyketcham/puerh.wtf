import { NOTE_STAGES, type NoteStage } from "@/lib/types/session"

export { NOTE_STAGES }

/** Display metadata for each tasting-note stage (shared by NotesPanel, cube faces, command bar). */
export const NOTE_STAGE_META: Record<NoteStage, { title: string; icon: string }> = {
	dry_leaf_nose: { title: "Dry Leaf", icon: "🍃" },
	wet_leaf_nose: { title: "Wet Leaf", icon: "💧" },
	mouthfeel: { title: "Mouthfeel", icon: "👄" },
	taste: { title: "Taste", icon: "👅" },
	finish: { title: "Finish", icon: "🏁" },
	empty_cup: { title: "Empty Cup", icon: "🥣" },
	cha_qi: { title: "Cha Qi", icon: "✨" },
}

const LIQUOR_WORDS =
	/\b(liquor|soup|liquid|cups?|beaker|beak|beakered|brewed|brew|brewing|infusion|colou?r(?:ed)?|tea in)\b/

/**
 * Which tasting-note stage a session photo illustrates, from its alt text (cube ↔ notes linking).
 *
 * dry / compressed / cake → Dry Leaf · wet / rinsed / expanded → Wet Leaf ·
 * liquor in the cup → Taste (or Finish when it's "deep into the session") ·
 * empty cup, spent / brewed-out leaves → Empty Cup · wrappers & packaging → none.
 * Null when unclear.
 */
export function noteStageForImageAlt(alt: string | null | undefined): NoteStage | null {
	const a = (alt ?? "").toLowerCase().trim()
	if (!a) return null
	if (/\b(wrapper|packaging|package|card|bag|label|neifei)\b/.test(a)) return null
	if (/\bempty\b/.test(a)) return "empty_cup"
	if (/\b(spent|brewed[- ]out|used up)\b/.test(a)) return "empty_cup"
	if (/\b(wet\w*|rinsed|expanded|unfurled|opened up|flushing)\b/.test(a)) return "wet_leaf_nose"
	if (LIQUOR_WORDS.test(a)) {
		if (/\b(deep into|late in|later in|end of|final|last)\b/.test(a)) return "finish"
		return "taste"
	}
	if (/\b(dry|dried|compressed|pressed|cake|maocha|bing\s?hole|hunk|loose|broken)\b/.test(a)) {
		return "dry_leaf_nose"
	}
	if (/\b(leaf|leaves)\b/.test(a)) return "dry_leaf_nose"
	return null
}

export type StageImageMap = {
	/** stage of each image (index-aligned with images) */
	stages: (NoteStage | null)[]
	/** first image index for each stage that has a photo */
	byStage: Partial<Record<NoteStage, number>>
}

export function buildStageImageMap(
	images: readonly { alt: string }[] | null | undefined
): StageImageMap {
	const stages = (images ?? []).map((img) => noteStageForImageAlt(img.alt))
	const byStage: Partial<Record<NoteStage, number>> = {}
	stages.forEach((stage, i) => {
		if (stage && byStage[stage] == null) byStage[stage] = i
	})
	return { stages, byStage }
}
