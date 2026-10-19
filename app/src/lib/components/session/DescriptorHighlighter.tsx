"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtomValue, useSetAtom, useStore } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp, Pin, X } from "lucide-react"
import {
	commandBarAtom,
	currentLiquorAtom,
	descriptorAtom,
	explorerSessionsAtom,
	openCommandBarAtom,
	sessionAtom,
	sessionSlugAtom,
} from "@/lib/store/sessionAtom"
import { descriptorRegex, findDescriptorMatches, sessionMatchesDescriptor } from "@/lib/descriptors"
import { liftLiquor, rgbCss } from "@/lib/liquor"
import { cn } from "@/lib/utils/cn"

// ---------------------------------------------------------------------------
// Text → Ranges (never mutates the article)
// ---------------------------------------------------------------------------

const BLOCK_SELECTOR = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,pre,div"
const HIGHLIGHT = "descriptor"
const HIGHLIGHT_CURRENT = "descriptor-current"

type TextChunk = { node: Text; start: number }

/** Every occurrence of `term` in `root`'s text as DOM Ranges (matches may span inline tags). */
function findRanges(root: Element, term: string): Range[] {
	const re = descriptorRegex(term)
	if (!re) return []

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.nodeValue && !node.parentElement?.closest("script,style")
				? NodeFilter.FILTER_ACCEPT
				: NodeFilter.FILTER_REJECT,
	})

	const chunks: TextChunk[] = []
	let text = ""
	let prevBlock: Element | null = null
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const block = node.parentElement?.closest(BLOCK_SELECTOR) ?? root
		// keep words in adjacent blocks apart ("…tea.</p><p>Leather…")
		if (chunks.length && block !== prevBlock) text += "\n"
		chunks.push({ node: node as Text, start: text.length })
		text += node.nodeValue
		prevBlock = block
	}
	if (!chunks.length) return []

	const locate = (pos: number) => {
		let lo = 0
		let hi = chunks.length - 1
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1
			if (chunks[mid].start <= pos) lo = mid
			else hi = mid - 1
		}
		return chunks[lo]
	}

	const ranges: Range[] = []
	for (const match of text.matchAll(re)) {
		const start = match.index ?? 0
		const end = start + match[0].length
		const a = locate(start)
		const b = locate(end - 1)
		const range = document.createRange()
		range.setStart(a.node, Math.min(start - a.start, a.node.length))
		range.setEnd(b.node, Math.min(end - b.start, b.node.length))
		ranges.push(range)
	}
	return ranges
}

const highlightsSupported = () =>
	typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined"

// ---------------------------------------------------------------------------

/**
 * "Find references" for tasting descriptors.
 *
 * Highlights every occurrence of descriptorAtom's term in the session article with the CSS
 * Custom Highlight API (no DOM mutation; no-op where unsupported), and floats a small
 * references counter over the editor column: N references in this session · M other sessions,
 * with prev/next stepping through the article. Esc unpins.
 */
export default function DescriptorHighlighter() {
	const store = useStore()
	const descriptor = useAtomValue(descriptorAtom)
	const setDescriptor = useSetAtom(descriptorAtom)
	const session = useAtomValue(sessionAtom)
	const slug = useAtomValue(sessionSlugAtom)
	const liquor = useAtomValue(currentLiquorAtom)
	const sessions = useAtomValue(explorerSessionsAtom)
	const openCommandBar = useSetAtom(openCommandBarAtom)
	const reduced = useReducedMotion()

	const term = descriptor?.term ?? null
	const pinned = descriptor?.pinned ?? false

	const rangesRef = useRef<Range[]>([])
	const [articleCount, setArticleCount] = useState(0)
	const [cursor, setCursor] = useState(-1)

	// Highlight the article
	useEffect(() => {
		const supported = highlightsSupported()
		const article =
			document.querySelector(`[data-session-slug="${slug}"] [data-session-article]`) ??
			document.querySelector("[data-session-article]")

		const run = () => {
			const ranges = term && article ? findRanges(article, term) : []
			rangesRef.current = ranges
			setArticleCount(ranges.length)
			setCursor(-1)
			if (!supported) return
			CSS.highlights.delete(HIGHLIGHT_CURRENT)
			if (ranges.length) {
				const highlight = new Highlight(...ranges)
				highlight.priority = 2
				CSS.highlights.set(HIGHLIGHT, highlight)
			} else {
				CSS.highlights.delete(HIGHLIGHT)
			}
		}
		run()

		const observer = article ? new MutationObserver(run) : null
		observer?.observe(article!, { childList: true, subtree: true, characterData: true })
		return () => {
			observer?.disconnect()
			if (supported) {
				CSS.highlights.delete(HIGHLIGHT)
				CSS.highlights.delete(HIGHLIGHT_CURRENT)
			}
		}
	}, [term, slug])

	// Notes-panel references in this session
	const notesCount = useMemo(
		() => (term && session ? findDescriptorMatches({ notes: session.notes }, term).length : 0),
		[term, session]
	)

	// Other sessions mentioning it
	const otherSessions = useMemo(
		() =>
			term
				? sessions.filter((s) => s._slug !== slug && sessionMatchesDescriptor(s, term)).length
				: 0,
		[term, sessions, slug]
	)

	const total = articleCount + notesCount

	const step = useCallback(
		(dir: 1 | -1) => {
			const ranges = rangesRef.current
			if (!ranges.length) return
			const nextCursor =
				cursor < 0
					? dir > 0
						? 0
						: ranges.length - 1
					: (cursor + dir + ranges.length) % ranges.length
			setCursor(nextCursor)
			const range = ranges[nextCursor]
			if (highlightsSupported()) {
				const current = new Highlight(range)
				current.priority = 3
				CSS.highlights.set(HIGHLIGHT_CURRENT, current)
			}
			const rect = range.getBoundingClientRect()
			window.scrollTo({
				top: window.scrollY + rect.top - window.innerHeight * 0.38,
				behavior: reduced ? "auto" : "smooth",
			})
		},
		[cursor, reduced]
	)

	// Esc unpins (unless something else, e.g. the command bar, is handling it)
	useEffect(() => {
		if (!pinned) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return
			if (store.get(commandBarAtom).open) return
			const target = e.target as HTMLElement | null
			if (target?.closest("input,textarea,select,[contenteditable=true],[role=dialog]")) return
			setDescriptor(null)
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [pinned, setDescriptor, store])

	const accent = useMemo(() => liftLiquor(liquor.rgb), [liquor])
	const highlightCss = useMemo(
		() =>
			`::highlight(${HIGHLIGHT}){background-color:${rgbCss(
				liquor.rgb,
				0.3
			)};color:#fff;text-decoration:underline solid ${rgbCss(
				accent,
				0.9
			)};text-decoration-thickness:2px;text-underline-offset:3px}` +
			`::highlight(${HIGHLIGHT_CURRENT}){background-color:${rgbCss(accent, 0.55)};color:#fff}`,
		[liquor, accent]
	)

	const spring = reduced
		? { duration: 0 }
		: { type: "spring" as const, stiffness: 460, damping: 36 }

	return (
		<>
			<style>{highlightCss}</style>

			<div
				className="fixed z-30 flex justify-center pointer-events-none left-[var(--explorer-w)] right-[var(--rightpanel-w)] bottom-[calc(var(--statusbar-h)+1rem)] px-8"
				aria-live="polite"
			>
				<AnimatePresence>
					{term && (
						<motion.div
							key="descriptor-refs"
							layout={!reduced}
							// transform + opacity only: a filter blur here repaints the backdrop-blurred pill
							// every frame
							initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
							transition={spring}
							style={{ borderRadius: 10 }}
							className={cn(
								// a hover preview can't be reached by the pointer anyway; only a pinned one is interactive
								pinned ? "pointer-events-auto" : "pointer-events-none",
								"flex items-center gap-1 pl-3 pr-1 h-8 max-w-full",
								"border border-heicha-500 bg-[#1a181a]/90 backdrop-blur-xl shadow-[0_8px_30px_-10px_rgba(0,0,0,0.8)]",
								"font-fira-code text-[11px] text-white/60"
							)}
							data-descriptor-references
						>
							<motion.span layout="position" className="flex items-center min-w-0 gap-2">
								<span
									aria-hidden
									className="inline-block rounded-full size-2 shrink-0"
									style={{
										backgroundColor: liquor.hex,
										boxShadow: pinned ? `0 0 0 3px ${rgbCss(accent, 0.22)}` : undefined,
									}}
								/>
								<AnimatePresence mode="popLayout" initial={false}>
									<motion.span
										key={term}
										className="truncate max-w-48"
										style={{ color: rgbCss(accent) }}
										initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
										transition={spring}
									>
										{term}
									</motion.span>
								</AnimatePresence>
								<span className="whitespace-nowrap tabular-nums">
									{total} {total === 1 ? "reference" : "references"} in this session
								</span>
							</motion.span>

							{pinned && articleCount > 0 && (
								<motion.span layout="position" className="flex items-center ml-1">
									<IconButton label="Previous reference in the text" onClick={() => step(-1)}>
										<ChevronUp className="size-3.5" />
									</IconButton>
									<span className="w-9 text-center tabular-nums text-white/40">
										{cursor < 0 ? `–/${articleCount}` : `${cursor + 1}/${articleCount}`}
									</span>
									<IconButton label="Next reference in the text" onClick={() => step(1)}>
										<ChevronDown className="size-3.5" />
									</IconButton>
								</motion.span>
							)}

							<motion.span layout="position" className="flex items-center">
								<span aria-hidden className="mx-1.5 text-white/20">
									·
								</span>
								<button
									type="button"
									className="px-1 rounded whitespace-nowrap tabular-nums underline-offset-2 decoration-white/30 hover:underline hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 disabled:no-underline disabled:cursor-default disabled:text-white/40"
									disabled={otherSessions === 0}
									onClick={() => openCommandBar({ query: term, scope: "descriptors" })}
									title={`Find “${term}” across all sessions`}
								>
									{otherSessions} other {otherSessions === 1 ? "session" : "sessions"}
								</button>
							</motion.span>

							<motion.span layout="position" className="flex items-center ml-1">
								{pinned ? (
									<IconButton label={`Unpin “${term}” (Esc)`} onClick={() => setDescriptor(null)}>
										<X className="size-3.5" />
									</IconButton>
								) : (
									<span className="flex items-center gap-1 pr-2 whitespace-nowrap text-white/30">
										<Pin aria-hidden className="size-3" />
										click to pin
									</span>
								)}
							</motion.span>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</>
	)
}

function IconButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className="flex items-center justify-center rounded-md size-6 text-white/50 hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
		>
			{children}
		</button>
	)
}
