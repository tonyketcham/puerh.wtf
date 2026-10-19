"use client"

import { memo, useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react"
import { useAtom, useAtomValue } from "jotai"
import { motion, useReducedMotion } from "motion/react"
import DetailsListItem from "@/lib/components/DetailsListItem"
import PanelSection from "@/lib/components/containers/PanelSection"
import {
	currentLiquorAtom,
	descriptorAtom,
	hoveredNoteStageAtom,
	notesAtom,
	sessionAtom,
	type DescriptorSelection,
} from "@/lib/store/sessionAtom"
import { NOTE_STAGES, NOTE_STAGE_META } from "@/lib/noteStages"
import { descriptorRegex, splitDescriptors } from "@/lib/descriptors"
import { buildStageImageMap } from "@/lib/noteStages"
import { liftLiquor, rgbCss } from "@/lib/liquor"
import type { NoteStage } from "@/lib/types/session"
import { cn } from "@/lib/utils/cn"

// ---------------------------------------------------------------------------
// Note text → descriptor tokens
// ---------------------------------------------------------------------------

type Segment = { text: string; term?: string }

/** Splits a note into plain text and descriptor tokens, keeping the original wording. */
function tokenize(text: string): Segment[] {
	const hits: { index: number; length: number; term: string }[] = []
	for (const term of splitDescriptors(text)) {
		const re = descriptorRegex(term)
		if (!re) continue
		for (const m of text.matchAll(re)) {
			hits.push({ index: m.index ?? 0, length: m[0].length, term })
		}
	}
	// earliest first, longest wins on ties; drop overlaps ("dark chocolate" beats "chocolate")
	hits.sort((a, b) => a.index - b.index || b.length - a.length)

	const segments: Segment[] = []
	let cursor = 0
	for (const hit of hits) {
		if (hit.index < cursor) continue
		if (hit.index > cursor) segments.push({ text: text.slice(cursor, hit.index) })
		segments.push({ text: text.slice(hit.index, hit.index + hit.length), term: hit.term })
		cursor = hit.index + hit.length
	}
	if (cursor < text.length) segments.push({ text: text.slice(cursor) })
	return segments
}

// ---------------------------------------------------------------------------

/**
 * Notes section of the Properties panel.
 *
 * - Cube ↔ notes: hovering/focusing a row sets hoveredNoteStageAtom (the photo cube turns to
 *   that stage's photo); when the cube is hovered, the row for the visible face lights up.
 * - Find references: each note reads as text, but its descriptors are tokens. Hover previews
 *   the descriptor (descriptorAtom, unpinned); click pins it (click again or Esc to unpin).
 */
export default function NotesPanel() {
	const notes = useAtomValue(notesAtom)
	const session = useAtomValue(sessionAtom)
	const liquor = useAtomValue(currentLiquorAtom)
	const [hoveredStage, setHoveredStage] = useAtom(hoveredNoteStageAtom)
	const [descriptor, setDescriptor] = useAtom(descriptorAtom)

	const stageMap = useMemo(() => buildStageImageMap(session?.images), [session?.images])
	const accent = useMemo(() => rgbCss(liftLiquor(liquor.rgb)), [liquor])

	const activeRegex = useMemo(
		() => (descriptor ? descriptorRegex(descriptor.term, "iu") : null),
		[descriptor]
	)

	// --- descriptor hover / pin ----------------------------------------------------------

	/** a pinned selection temporarily replaced by a hover preview */
	const restoreRef = useRef<DescriptorSelection | null>(null)
	const descriptorRef = useRef(descriptor)
	useLayoutEffect(() => {
		descriptorRef.current = descriptor
	}, [descriptor])

	const previewTerm = useCallback(
		(term: string) => {
			const current = descriptorRef.current
			if (current?.term === term) return
			if (current?.pinned) restoreRef.current = current
			setDescriptor({ term, pinned: false })
		},
		[setDescriptor]
	)

	const endPreview = useCallback(
		(term: string) => {
			const restore = restoreRef.current
			restoreRef.current = null
			setDescriptor((prev) => (prev && !prev.pinned && prev.term === term ? restore : prev))
		},
		[setDescriptor]
	)

	const togglePin = useCallback(
		(term: string) => {
			restoreRef.current = null
			setDescriptor((prev) => (prev?.pinned && prev.term === term ? null : { term, pinned: true }))
		},
		[setDescriptor]
	)

	// --- stage hover ---------------------------------------------------------------------

	const enterStage = useCallback((stage: NoteStage) => setHoveredStage(stage), [setHoveredStage])
	const leaveStage = useCallback(
		(stage: NoteStage) => setHoveredStage((prev) => (prev === stage ? null : prev)),
		[setHoveredStage]
	)

	return (
		<PanelSection title="Notes">
			<ul className="space-y-4" style={{ "--descriptor-accent": accent } as CSSProperties}>
				{notes &&
					NOTE_STAGES.map((stage) => {
						const value = notes[stage]
						if (!value) return null
						const meta = NOTE_STAGE_META[stage]
						const photoIndex = stageMap.byStage[stage]
						const photo = photoIndex != null ? session?.images?.[photoIndex] : undefined
						const active = hoveredStage === stage
						return (
							<DetailsListItem
								key={stage}
								icon={meta.icon}
								title={meta.title}
								active={active}
								data-note-stage={stage}
								// rows whose note has no descriptor tokens still need a keyboard stop for the cube link
								tabIndex={photo && splitDescriptors(value).length === 0 ? 0 : undefined}
								onMouseEnter={() => enterStage(stage)}
								onMouseLeave={() => leaveStage(stage)}
								onFocus={() => enterStage(stage)}
								onBlur={(e) => {
									if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leaveStage(stage)
								}}
								aside={photo ? <PhotoThumb src={photo.image} alt={photo.alt} lit={active} /> : null}
								value={
									<NoteText
										text={value}
										activeRegex={activeRegex}
										pinnedTerm={descriptor?.pinned ? descriptor.term : null}
										onPreview={previewTerm}
										onEndPreview={endPreview}
										onToggle={togglePin}
									/>
								}
							/>
						)
					})}
			</ul>
		</PanelSection>
	)
}

// ---------------------------------------------------------------------------

/** Tiny photo glyph: a dim, desaturated thumb that lights up when its photo is on the cube. */
function PhotoThumb({ src, alt, lit }: { src: string; alt: string; lit: boolean }) {
	const reduced = useReducedMotion()
	return (
		<motion.span
			aria-hidden
			title={alt ? `Photo: ${alt}` : "Has a photo"}
			className={cn(
				"relative block overflow-hidden rounded-[3px] w-5 h-3.5 shrink-0 ring-1 transition-[box-shadow] duration-200",
				lit ? "ring-[var(--descriptor-accent)]" : "ring-white/20"
			)}
			initial={false}
			animate={{
				opacity: lit ? 1 : 0.42,
				scale: lit && !reduced ? 1.12 : 1,
				filter: lit ? "grayscale(0) brightness(1)" : "grayscale(1) brightness(0.8)",
			}}
			transition={
				reduced
					? { duration: 0 }
					: { type: "spring", stiffness: 500, damping: 30, filter: { duration: 0.2 } }
			}
		>
			<img
				src={src}
				alt=""
				draggable={false}
				loading="lazy"
				className="object-cover w-full h-full"
			/>
		</motion.span>
	)
}

// ---------------------------------------------------------------------------

type NoteTextProps = {
	text: string
	activeRegex: RegExp | null
	pinnedTerm: string | null
	onPreview: (term: string) => void
	onEndPreview: (term: string) => void
	onToggle: (term: string) => void
}

const NoteText = memo(function NoteText({
	text,
	activeRegex,
	pinnedTerm,
	onPreview,
	onEndPreview,
	onToggle,
}: NoteTextProps) {
	const segments = useMemo(() => tokenize(text), [text])

	return (
		<>
			{segments.map((segment, i) => {
				if (!segment.term) return <span key={i}>{segment.text}</span>
				const term = segment.term
				const matches = activeRegex ? activeRegex.test(segment.text) : false
				const pinned = pinnedTerm === term
				return (
					<span
						key={i}
						role="button"
						tabIndex={0}
						data-descriptor={term}
						data-match={matches || undefined}
						aria-pressed={pinned}
						aria-label={`${segment.text}: find references`}
						onMouseEnter={() => onPreview(term)}
						onMouseLeave={() => onEndPreview(term)}
						onFocus={() => onPreview(term)}
						onBlur={() => onEndPreview(term)}
						onClick={() => onToggle(term)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault()
								onToggle(term)
							}
						}}
						className={cn(
							// a real inline span so multi-word tokens wrap like the text around them;
							// only the underline speaks
							"cursor-pointer rounded-[2px] [box-decoration-break:clone]",
							"underline decoration-1 underline-offset-[3px] decoration-transparent",
							"transition-[color,text-decoration-color,background-color] duration-150",
							"hover:decoration-white/45 hover:text-white",
							"focus:outline-none focus-visible:decoration-white/60 focus-visible:text-white",
							matches &&
								"text-[var(--descriptor-accent)] decoration-[var(--descriptor-accent)] hover:text-[var(--descriptor-accent)] hover:decoration-[var(--descriptor-accent)]",
							pinned && "bg-[rgb(var(--liquor-rgb,237_196_70)/0.14)] decoration-2"
						)}
					>
						{segment.text}
					</span>
				)
			})}
		</>
	)
})
