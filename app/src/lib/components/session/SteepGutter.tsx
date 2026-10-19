"use client"

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type PropsWithChildren,
} from "react"
import { useAtomValue, useStore } from "jotai"
import { animate, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react"
import type { SessionBrewing } from "@/lib/types/session"
import {
	activeSteepAtom,
	commandBarAtom,
	flavorPhaseAtom,
	flavorPhaseMotion,
	flavorPhaseSourceAtom,
	scrollRunwayAtom,
	steepsAtom,
	type DetectedSteep,
} from "@/lib/store/sessionAtom"
import {
	computeSteepSchedule,
	findSteepMentions,
	formatSeconds,
	steepSeconds,
	type SteepMention,
} from "@/lib/steeps"
import { cn } from "@/lib/utils/cn"
import {
	readingModeAtom,
	steepRequestAtom,
	SPRING_SNAPPY,
	SPRING_SOFT,
	type ReadingMode,
} from "./readingState"
import { ARTICLE_REFLOW_EVENT } from "./FlowAroundArticle"

export interface SteepGutterProps {
	/** current session slug (reset/measure key) */
	slug: string
	/** brewing params for the planned schedule (computeSteepSchedule) */
	brewing: SessionBrewing | null
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Reading line as a fraction of viewport height: a marker "fires" when its line crosses it. */
const READING_LINE = 0.4
/** Dead band (px) around the reading line so resting near a marker never flickers. */
const HYSTERESIS = 14
/** Below this much scroll runway (fraction of viewport) scroll-linking is disabled. */
const MIN_RUNWAY_VH = 0.5
/** After a radar scrub, scroll only takes the phase back after this much deliberate scrolling. */
const SCRUB_RELEASE_PX = 120
/** After a steep click, the next deliberate scroll of this much hands control back to scroll. */
const STEEP_RELEASE_PX = 32
/** Marker row height + gap (px); markers on the same line stack downward like gutter glyphs. */
const MARKER_H = 20
const MARKER_GAP = 2
/** Planned steeps shown when the prose never mentions a steep. */
const SCHEDULE_CHIPS = 8
const BLOCK_SELECTOR = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,pre"
/** A heading that introduces a steep-by-steep log ("### Infusions" in most write-ups). */
const STEEP_HEADING = /\b(infusions?|steeps?|brews?|steeping)\b/i
const HIGHLIGHT_NAMES = [
	"steep-mention",
	"steep-hover",
	"steep-active",
	"steep-block-hover",
	"steep-block-active",
] as const

// mention anchors tint the words; block anchors (a whole infusion-log item) get a faint
// "current line" wash instead, like an editor's active line
const HIGHLIGHT_CSS = `
::highlight(steep-mention){text-decoration:underline dotted rgb(var(--liquor-text-rgb, 217 164 65) / 0.6);text-decoration-thickness:1px}
::highlight(steep-hover){background-color:rgb(var(--liquor-rgb, 217 164 65) / 0.16)}
::highlight(steep-active){background-color:rgb(var(--liquor-rgb, 217 164 65) / 0.3);color:#fff;text-decoration:underline solid rgb(var(--liquor-text-rgb, 217 164 65) / 0.95);text-decoration-thickness:1px}
::highlight(steep-block-hover){background-color:rgb(var(--liquor-rgb, 217 164 65) / 0.06)}
::highlight(steep-block-active){background-color:rgb(var(--liquor-rgb, 217 164 65) / 0.11)}
`

type Anchor = {
	n: number
	nEnd?: number
	seconds: number
	match: string
	/** center of the mention's first line, relative to the wrapper top */
	lineY: number
	/** marker top after collision stacking, relative to the wrapper top */
	top: number
}

type FoundMention = {
	mention: SteepMention
	/** what gets highlighted */
	range: Range
	/** where the marker sits: the first character of the mention / log item */
	pos: Range
	/** a whole infusion-log item rather than a phrase in the prose */
	block: boolean
}

type AnchorRange = { range: Range; block: boolean }

// ---------------------------------------------------------------------------
// DOM text → steep mentions (read-only: never mutates the article)
// ---------------------------------------------------------------------------

/** Range over the first visible character inside `el` (marker placement for block anchors). */
function firstCharRange(el: Element): Range | null {
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		const i = node.data.search(/\S/)
		if (i < 0) continue
		const range = document.createRange()
		range.setStart(node, i)
		range.setEnd(node, i + 1)
		return range
	}
	return null
}

/**
 * Infusion logs: ordered lists under a heading like "### Infusions" (57 of 70 write-ups).
 * Item k of a list starting at s is steep s + k. Lists run until the next heading of the same
 * or a higher level.
 */
function collectLogItems(article: Element): { items: FoundMention[]; lists: Element[] } {
	const items: FoundMention[] = []
	const lists: Element[] = []
	for (const heading of Array.from(article.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
		if (!STEEP_HEADING.test(heading.textContent ?? "")) continue
		const level = Number(heading.tagName[1])
		for (let el = heading.nextElementSibling; el; el = el.nextElementSibling) {
			if (/^H[1-6]$/.test(el.tagName) && Number(el.tagName[1]) <= level) break
			if (!(el instanceof HTMLOListElement)) continue
			lists.push(el)
			const start = Number.isFinite(el.start) ? el.start : 1
			Array.from(el.children)
				.filter((child) => child.tagName === "LI")
				.forEach((li, i) => {
					const pos = firstCharRange(li)
					if (!pos) return
					const range = document.createRange()
					range.selectNodeContents(li)
					const text = (li.textContent ?? "").replace(/\s+/g, " ").trim()
					const match = text.length > 28 ? `${text.slice(0, 27)}…` : text
					items.push({ mention: { n: start + i, index: 0, match }, range, pos, block: true })
				})
		}
	}
	return { items, lists }
}

function collectProseMentions(article: Element, skip: Element[]): FoundMention[] {
	const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
	const groups: { block: Element; nodes: Text[] }[] = []
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		if (!node.data) continue
		if (skip.some((el) => el.contains(node))) continue
		const block = node.parentElement?.closest(BLOCK_SELECTOR) ?? article
		const last = groups[groups.length - 1]
		if (last && last.block === block) last.nodes.push(node)
		else groups.push({ block, nodes: [node] })
	}

	const out: FoundMention[] = []
	for (const { nodes } of groups) {
		const starts: number[] = []
		let text = ""
		for (const t of nodes) {
			starts.push(text.length)
			text += t.data
		}
		const locate = (offset: number, isEnd: boolean): [Text, number] => {
			let i = nodes.length - 1
			while (i > 0 && (isEnd ? starts[i] >= offset : starts[i] > offset)) i--
			return [nodes[i], Math.min(nodes[i].data.length, offset - starts[i])]
		}
		for (const mention of findSteepMentions(text)) {
			try {
				const range = document.createRange()
				const [sn, so] = locate(mention.index, false)
				const [en, eo] = locate(mention.index + mention.match.length, true)
				range.setStart(sn, so)
				range.setEnd(en, eo)
				out.push({ mention, range, pos: range, block: false })
			} catch {
				// a malformed offset: skip the mention rather than break the page
			}
		}
	}
	return out
}

/**
 * Every steep anchor candidate in reading order: infusion-log items, plus prose mentions of
 * steeps the log doesn't cover (a rinse described in the synopsis, a write-up with no log).
 */
function collectMentions(article: Element): FoundMention[] {
	const { items, lists } = collectLogItems(article)
	const logged = new Set(items.map((it) => it.mention.n))
	const prose = collectProseMentions(article, lists).filter(({ mention }) => !logged.has(mention.n))
	if (!items.length) return prose
	return [...items, ...prose].sort((a, b) =>
		a.pos.compareBoundaryPoints(Range.START_TO_START, b.pos)
	)
}

/**
 * First mention of each steep, then the longest run whose steep numbers increase in reading
 * order, so asides ("unlike the first steep…") never yank progress backwards.
 */
function pickAnchors(found: FoundMention[]): FoundMention[] {
	const seen = new Set<number>()
	const firsts = found.filter(({ mention }) => {
		if (seen.has(mention.n)) return false
		seen.add(mention.n)
		return true
	})
	if (firsts.length <= 1) return firsts
	const len = firsts.map(() => 1)
	const prev = firsts.map(() => -1)
	for (let i = 1; i < firsts.length; i++) {
		for (let j = 0; j < i; j++) {
			if (firsts[j].mention.n < firsts[i].mention.n && len[j] + 1 > len[i]) {
				len[i] = len[j] + 1
				prev[i] = j
			}
		}
	}
	let best = 0
	for (let i = 1; i < len.length; i++) if (len[i] > len[best]) best = i
	const keep: FoundMention[] = []
	for (let i = best; i >= 0; i = prev[i]) keep.unshift(firsts[i])
	return keep
}

/** The reading line in document px; it slides to the viewport bottom over the last stretch of
 * runway so anchors near the end of the article still fire before the page bottoms out. */
function readingLine(scrollY: number, vh: number, maxScroll: number): number {
	const zone = vh * 0.6
	const remaining = Math.max(0, maxScroll - scrollY)
	const t = remaining >= zone ? 0 : 1 - remaining / zone
	return scrollY + vh * (READING_LINE + (1 - READING_LINE) * t)
}

function phaseFor(list: { n: number }[], n: number | null): number {
	if (n == null || list.length <= 1) return 0
	const i = list.findIndex((s) => s.n === n)
	return i < 0 ? 0 : i / (list.length - 1)
}

function writeHash(n: number | null) {
	const { pathname, search, hash } = window.location
	const next = n == null ? "" : `#steep-${n}`
	if (hash === next) return
	if (n == null && !/^#steep-/.test(hash)) return
	// keep Next's own history state; a hash-only change needs no router round-trip
	window.history.replaceState(window.history.state, "", pathname + search + next)
}

function readHashSteep(): number | null {
	const m = window.location.hash.match(/^#steep-(\d{1,2})$/)
	return m ? Number(m[1]) : null
}

function sameAnchors(a: Anchor[], b: Anchor[]) {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i].n !== b[i].n || Math.abs(a[i].top - b[i].top) > 0.5) return false
	}
	return true
}

function isTypingTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false
	return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ActivateOpts = { phase?: boolean; hash?: boolean; force?: boolean }

/**
 * IDE-style gutter beside the session article. Steep mentions in the prose become gutter
 * markers ("breakpoints") with the planned steep time; the steep whose line has crossed the
 * reading line is lit in the liquor color and drives the radar's flavor phase.
 *
 * Anti-jank rules:
 * - Progression is discrete. Only crossing a marker (with a hysteresis band) changes the active
 *   steep; the phase then springs to that steep. Small scrolls never wobble the chart.
 * - Scroll-linking only runs when the page has real runway (≥ 0.5 viewport). Otherwise the
 *   gutter is the control: markers are buttons and [ / ] step through steeps.
 * - Last input wins: after a radar scrub, scroll takes over again only after ~120px of deliberate
 *   scrolling; after a steep click, on the next deliberate scroll.
 * - No mentions → no fake anchors: a sticky planned-schedule chip list, not scroll-linked.
 * - Finish waypoint: passing the end of the write-up springs the radar to its finish shape (and
 *   back, with the same hysteresis), so one-mention and no-mention pages still reach "finish".
 * - Deep links: #steep-N activates (and scrolls to) a steep; changes update the hash in place.
 *
 * Never mutates [data-session-article] (only FlowAroundArticle does): positions come from Ranges,
 * highlights from the CSS Custom Highlight API.
 */
export default function SteepGutter({
	slug,
	brewing,
	children,
}: PropsWithChildren<SteepGutterProps>) {
	const store = useStore()
	const reduce = useReducedMotion() ?? false
	const active = useAtomValue(activeSteepAtom)
	const source = useAtomValue(flavorPhaseSourceAtom)
	const commandBar = useAtomValue(commandBarAtom)
	const request = useAtomValue(steepRequestAtom)
	const { scrollY } = useScroll()

	const wrapperRef = useRef<HTMLDivElement>(null)
	const [anchors, setAnchors] = useState<Anchor[]>([])
	const [mode, setMode] = useState<ReadingMode | null>(null)
	const [hovered, setHovered] = useState<number | null>(null)

	const schedule = useMemo(() => computeSteepSchedule(brewing, SCHEDULE_CHIPS), [brewing])

	// --- refs mirrored for event handlers (no re-render per scroll frame) ---
	const foundRef = useRef<FoundMention[] | null>(null)
	const anchorRangesRef = useRef<Map<number, AnchorRange>>(new Map())
	const anchorsRef = useRef<Anchor[]>([])
	const docTopRef = useRef(0)
	const modeRef = useRef<ReadingMode | null>(null)
	const activeRef = useRef<number | null>(store.get(activeSteepAtom))
	const reduceRef = useRef(reduce)
	const lockYRef = useRef(0)
	const programmaticRef = useRef<{ target: number; until: number } | null>(null)
	/** set when the radar is scrubbed; scroll stays hands-off until SCRUB_RELEASE_PX of scrolling */
	const scrubLockRef = useRef(false)
	const initializedRef = useRef(false)
	/** article end (wrapper-relative): the "finish" waypoint every scrollable page reaches */
	const endOffsetRef = useRef(0)
	/** reading line is past the article end → the radar rests on its finish shape */
	const finishedRef = useRef(false)
	const commandOpenRef = useRef(commandBar.open)
	useLayoutEffect(() => {
		reduceRef.current = reduce
		commandOpenRef.current = commandBar.open
	}, [reduce, commandBar.open])

	/** steeps the user can step through: anchors when present, else the planned schedule */
	const stepList = useCallback(
		(): { n: number }[] => (anchorsRef.current.length ? anchorsRef.current : schedule),
		[schedule]
	)

	const springPhase = useCallback(
		(target: number) => {
			if (reduceRef.current) store.set(flavorPhaseAtom, target)
			else animate(flavorPhaseMotion, target, SPRING_SOFT)
		},
		[store]
	)

	/** phase for a steep; past the article end the session has "finished" whatever was mentioned */
	const phaseTarget = useCallback(
		(n: number | null) => (finishedRef.current ? 1 : phaseFor(stepList(), n)),
		[stepList]
	)

	const activate = useCallback(
		(n: number | null, { phase = true, hash = true, force = false }: ActivateOpts = {}) => {
			if (activeRef.current === n && !force) return
			activeRef.current = n
			store.set(activeSteepAtom, n)
			if (phase) springPhase(phaseTarget(n))
			if (hash) writeHash(n)
		},
		[store, springPhase, phaseTarget]
	)

	/**
	 * Recompute the active steep (and the finish waypoint) from the scroll position: discrete,
	 * with hysteresis. Pages that mention one steep or none still reach the radar's finish shape
	 * when the reading line passes the end of the write-up, as a single spring, never a scrub.
	 */
	const resync = useCallback(
		(opts: { force?: boolean; hash?: boolean } = {}) => {
			const mode = modeRef.current
			if (mode !== "steps" && mode !== "smooth") return
			const vh = window.innerHeight
			const max = Math.max(0, document.documentElement.scrollHeight - vh)
			const line = readingLine(scrollY.get(), vh, max)

			// finish waypoint; never above where the reading line rests at the top of the page
			const endY = Math.max(docTopRef.current + endOffsetRef.current, vh * (READING_LINE + 0.25))
			const wasFinished = finishedRef.current
			const finished = opts.force
				? line >= endY
				: wasFinished
				? line >= endY - HYSTERESIS
				: line >= endY + HYSTERESIS
			finishedRef.current = finished
			const finishChanged = finished !== wasFinished

			if (mode === "smooth") {
				if (!finishChanged && !opts.force) return
				if (store.get(flavorPhaseSourceAtom) === "auto") store.set(flavorPhaseSourceAtom, "scroll")
				// scroll owns the radar again: a planned chip picked earlier no longer applies
				if (activeRef.current != null) {
					activeRef.current = null
					store.set(activeSteepAtom, null)
				}
				springPhase(finished ? 1 : 0)
				return
			}

			const list = anchorsRef.current
			if (!list.length) return
			const docY = (a: Anchor) => docTopRef.current + a.lineY
			const idxAt = (l: number) => {
				let idx = -1
				for (let i = 0; i < list.length; i++) if (docY(list[i]) <= l) idx = i
				return idx
			}
			const cur = list.findIndex((a) => a.n === activeRef.current)
			let next = cur
			if (opts.force) next = idxAt(line)
			else {
				const fwd = idxAt(line - HYSTERESIS)
				const back = idxAt(line + HYSTERESIS)
				if (fwd > cur) next = fwd
				else if (back < cur) next = back
			}
			if (next === cur && !opts.force) {
				if (finishChanged) {
					if (store.get(flavorPhaseSourceAtom) === "auto")
						store.set(flavorPhaseSourceAtom, "scroll")
					springPhase(phaseTarget(activeRef.current))
				}
				return
			}
			if (store.get(flavorPhaseSourceAtom) === "auto") store.set(flavorPhaseSourceAtom, "scroll")
			activate(next < 0 ? null : list[next].n, { force: opts.force, hash: opts.hash ?? true })
		},
		[activate, phaseTarget, scrollY, springPhase, store]
	)

	/** Explicit selection (click, keys, status bar, deep link). */
	const goto = useCallback(
		(n: number, { scroll = true, hash = true }: { scroll?: boolean; hash?: boolean } = {}) => {
			store.set(flavorPhaseSourceAtom, "steep")
			scrubLockRef.current = false
			// an explicit pick shows that steep, even from the bottom of the page
			finishedRef.current = false
			activate(n, { force: true, hash })
			const y = scrollY.get()
			lockYRef.current = y
			if (!scroll || modeRef.current !== "steps") return
			const anchor = anchorsRef.current.find((a) => a.n === n)
			if (!anchor) return
			const vh = window.innerHeight
			const max = Math.max(0, document.documentElement.scrollHeight - vh)
			const target = Math.min(
				max,
				Math.max(0, docTopRef.current + anchor.lineY - vh * READING_LINE)
			)
			if (Math.abs(target - y) < 2) return
			programmaticRef.current = { target, until: performance.now() + 1600 }
			window.scrollTo({ top: target, behavior: reduceRef.current ? "auto" : "smooth" })
		},
		[activate, scrollY, store]
	)

	const step = useCallback(
		(delta: 1 | -1) => {
			const list = stepList()
			if (!list.length) return
			const cur = list.findIndex((s) => s.n === activeRef.current)
			const next =
				cur < 0 ? (delta > 0 ? 0 : -1) : Math.min(list.length - 1, Math.max(0, cur + delta))
			if (next < 0 || next === cur) return
			goto(list[next].n)
		},
		[goto, stepList]
	)

	// --- measuring -----------------------------------------------------------

	const measure = useCallback(() => {
		const wrapper = wrapperRef.current
		const article = wrapper?.querySelector("[data-session-article]")
		if (!wrapper || !article) return

		// re-collect if the article's text nodes were replaced (Fast Refresh, streamed re-render):
		// stale Ranges collapse to no rects and the gutter would fall back to the planned schedule
		// (rewritten text nodes keep the node but collapse any Range inside them)
		if (foundRef.current?.some((f) => f.pos.collapsed || !f.pos.startContainer.isConnected)) {
			foundRef.current = null
			anchorsRef.current = []
		}
		if (!foundRef.current) foundRef.current = pickAnchors(collectMentions(article))
		const found = foundRef.current
		const wrapperRect = wrapper.getBoundingClientRect()
		docTopRef.current = wrapperRect.top + window.scrollY
		// roughly the last line of the write-up
		endOffsetRef.current = article.getBoundingClientRect().bottom - wrapperRect.top - MARKER_H

		const next: Anchor[] = []
		const ranges = new Map<number, AnchorRange>()
		let lastTop = -Infinity
		for (const { mention, range, pos, block } of found) {
			const rect = pos.getClientRects()[0]
			if (!rect) continue
			const lineY = rect.top + rect.height / 2 - wrapperRect.top
			const top = Math.max(lineY - MARKER_H / 2, lastTop + MARKER_H + MARKER_GAP)
			lastTop = top
			next.push({
				n: mention.n,
				nEnd: mention.nEnd,
				seconds: steepSeconds(brewing, mention.n) ?? 0,
				match: mention.match,
				lineY,
				top,
			})
			ranges.set(mention.n, { range, block })
		}
		anchorRangesRef.current = ranges
		const anchorsChanged = !sameAnchors(anchorsRef.current, next)
		anchorsRef.current = next
		if (anchorsChanged) setAnchors(next)

		// scroll runway
		const vh = window.innerHeight
		const runwayPx = Math.max(0, Math.round(document.documentElement.scrollHeight - vh))
		const scrollable = runwayPx >= vh * MIN_RUNWAY_VH
		const prevRunway = store.get(scrollRunwayAtom)
		if (prevRunway.scrollable !== scrollable || prevRunway.runwayPx !== runwayPx) {
			store.set(scrollRunwayAtom, { scrollable, runwayPx })
		}

		const nextMode: ReadingMode = scrollable ? (next.length ? "steps" : "smooth") : "static"
		const prevMode = modeRef.current
		modeRef.current = nextMode
		if (prevMode !== nextMode) {
			setMode(nextMode)
			store.set(readingModeAtom, { slug, mode: nextMode })
		}

		// steeps for the rest of the app
		const steeps: DetectedSteep[] = next.length
			? next.map((a) => ({ n: a.n, seconds: a.seconds, hasAnchor: true }))
			: schedule.map((s) => ({ n: s.n, seconds: s.seconds, hasAnchor: false }))
		const prevSteeps = store.get(steepsAtom)
		if (
			prevSteeps.length !== steeps.length ||
			prevSteeps.some((s, i) => s.n !== steeps[i].n || s.hasAnchor !== steeps[i].hasAnchor)
		) {
			store.set(steepsAtom, steeps)
		}

		// custom highlights for every anchored mention
		if (typeof CSS !== "undefined" && "highlights" in CSS && anchorsChanged) {
			// phrases only: a dotted underline under whole log items would be noise
			const phrases = [...ranges.values()].filter((r) => !r.block).map((r) => r.range)
			const all = new Highlight(...phrases)
			all.priority = 0
			CSS.highlights.set("steep-mention", all)
		}

		// mode transitions after the first settle
		if (initializedRef.current && prevMode !== nextMode && nextMode !== "static") {
			const src = store.get(flavorPhaseSourceAtom)
			if (src === "scroll" || src === "auto") resync({ force: true, hash: false })
		}
	}, [brewing, resync, schedule, slug, store])

	/** First settle: deep link, else sync to the scroll position / pick a sensible default. */
	const initialize = useCallback(() => {
		if (initializedRef.current) return
		measure()
		initializedRef.current = true
		const list = stepList()
		const hashed = readHashSteep()
		if (hashed != null && list.length) {
			// exact steep, else the next one the notes do mention ("> brew" links to #steep-1 even
			// when the prose starts at the rinse or skips to the second steep)
			const target = list.find((s) => s.n === hashed) ?? list.find((s) => s.n > hashed)
			if (target) {
				goto(target.n, { hash: target.n === hashed ? false : true })
				return
			}
		}
		if (modeRef.current === "steps" || modeRef.current === "smooth")
			resync({ force: true, hash: false })
		else if (modeRef.current === "static" && anchorsRef.current.length) {
			// the gutter is the control: start on the first steep so the panel has context
			activate(anchorsRef.current[0].n, { force: true, hash: false })
		}
	}, [activate, goto, measure, resync, stepList])

	useEffect(() => {
		const wrapper = wrapperRef.current
		if (!wrapper) return
		let frame = 0
		const queue = () => {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(measure)
		}
		measure()
		const ro = new ResizeObserver(queue)
		ro.observe(wrapper)
		ro.observe(document.body)
		window.addEventListener("resize", queue)
		// the article rebuilt its lines around the cube: held Ranges point at detached text
		window.addEventListener(ARTICLE_REFLOW_EVENT, queue)
		let cancelled = false
		const ready = document.fonts?.ready ?? Promise.resolve()
		ready.then(() => {
			if (cancelled) return
			requestAnimationFrame(() => !cancelled && initialize())
		})
		// fonts.ready can hang behind lazy font loads; never leave the gutter uninitialized
		const fallback = window.setTimeout(() => !cancelled && initialize(), 600)
		return () => {
			cancelled = true
			cancelAnimationFrame(frame)
			window.clearTimeout(fallback)
			ro.disconnect()
			window.removeEventListener("resize", queue)
			window.removeEventListener(ARTICLE_REFLOW_EVENT, queue)
		}
	}, [initialize, measure])

	// clean up page-scoped state on unmount
	useEffect(() => {
		return () => {
			if (typeof CSS !== "undefined" && "highlights" in CSS) {
				for (const name of HIGHLIGHT_NAMES) CSS.highlights.delete(name)
			}
			const current = store.get(readingModeAtom)
			if (current?.slug === slug) store.set(readingModeAtom, null)
		}
	}, [slug, store])

	// --- scroll: discrete steps + last-input-wins arbitration ----------------

	useMotionValueEvent(scrollY, "change", (y) => {
		// scroll restoration before the first settle must not clobber a #steep-N deep link
		if (!initializedRef.current) return
		const programmatic = programmaticRef.current
		if (programmatic) {
			if (Math.abs(y - programmatic.target) < 2 || performance.now() > programmatic.until) {
				programmaticRef.current = null
				lockYRef.current = y
			}
			return
		}
		const src = store.get(flavorPhaseSourceAtom)
		const moved = Math.abs(y - lockYRef.current)
		if (src === "steep") {
			if (moved <= STEEP_RELEASE_PX) return
			store.set(flavorPhaseSourceAtom, "scroll")
			resync({ force: true })
			return
		}
		// last input wins: the scrubber keeps the radar until a deliberate scroll, even after
		// it hands the source back on release
		if (scrubLockRef.current || src === "scrub") {
			if (moved <= SCRUB_RELEASE_PX) return
			scrubLockRef.current = false
			if (src === "scrub") store.set(flavorPhaseSourceAtom, "scroll")
			resync({ force: true })
			return
		}
		resync()
	})

	// a deliberate user gesture cancels "this scroll is ours" (browsers abort smooth scrolls too)
	useEffect(() => {
		const cancel = () => {
			if (!programmaticRef.current) return
			programmaticRef.current = null
			lockYRef.current = scrollY.get()
		}
		const onKey = (e: KeyboardEvent) => {
			if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key)) cancel()
		}
		window.addEventListener("wheel", cancel, { passive: true })
		window.addEventListener("touchstart", cancel, { passive: true })
		window.addEventListener("keydown", onKey)
		return () => {
			window.removeEventListener("wheel", cancel)
			window.removeEventListener("touchstart", cancel)
			window.removeEventListener("keydown", onKey)
		}
	}, [scrollY])

	// scrubbing the radar: remember where the page was, and let the gutter follow the scrub
	useEffect(() => {
		if (source !== "scrub") return
		scrubLockRef.current = true
		lockYRef.current = scrollY.get()
		const follow = (v: number) => {
			const list = stepList()
			if (!list.length) return
			const idx = list.length === 1 ? 0 : Math.round(v * (list.length - 1))
			activate(list[idx].n, { phase: false, hash: false })
		}
		follow(flavorPhaseMotion.get())
		return flavorPhaseMotion.on("change", follow)
	}, [activate, source, scrollY, stepList])

	// [ / ] step through steeps
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "[" && e.key !== "]") return
			if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
			if (commandOpenRef.current || isTypingTarget(e.target)) return
			e.preventDefault()
			step(e.key === "]" ? 1 : -1)
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [step])

	// requests from elsewhere (status bar)
	const lastNonceRef = useRef(request?.nonce ?? 0)
	useEffect(() => {
		if (!request || request.nonce === lastNonceRef.current) return
		lastNonceRef.current = request.nonce
		if (request.kind === "step") step(request.delta)
		else goto(request.n)
	}, [goto, request, step])

	// active / hovered mention highlights in the article
	useEffect(() => {
		if (typeof CSS === "undefined" || !("highlights" in CSS)) return
		const set = (kind: "active" | "hover", n: number | null) => {
			const anchor = n == null ? undefined : anchorRangesRef.current.get(n)
			for (const block of [false, true]) {
				const name = block ? `steep-block-${kind}` : `steep-${kind}`
				if (anchor && anchor.block === block) {
					const h = new Highlight(anchor.range)
					// under DescriptorHighlighter (2/3) so a pinned flavor reads on top; the
					// block wash sits under everything
					h.priority = block ? 0 : 1
					CSS.highlights.set(name, h)
				} else CSS.highlights.delete(name)
			}
		}
		set("active", active)
		set("hover", hovered !== active ? hovered : null)
	}, [active, anchors, hovered])

	// --- render ----------------------------------------------------------------

	const activeIndex = anchors.findIndex((a) => a.n === active)
	const railTop = anchors.length ? anchors[0].top + MARKER_H / 2 : 0
	const railBottom = anchors.length ? anchors[anchors.length - 1].top + MARKER_H / 2 : 0
	const fillHeight = activeIndex < 0 ? 0 : anchors[activeIndex].top + MARKER_H / 2 - railTop
	const isControl = mode === "static"

	return (
		<div
			ref={wrapperRef}
			className="relative flow-root"
			data-steep-gutter
			data-steep-mode={mode ?? undefined}
		>
			<style>{HIGHLIGHT_CSS}</style>

			<nav
				aria-label="Steeps"
				className="absolute top-0 bottom-0 right-[calc(100%+12px)] w-12 border-r border-white/[0.06] select-none font-fira-code"
			>
				{anchors.length > 0 ? (
					<>
						{/* rail: how far into the session we are, filled with the liquor */}
						<div
							aria-hidden
							className="absolute left-[9.5px] w-px bg-white/[0.08]"
							style={{ top: railTop, height: Math.max(0, railBottom - railTop) }}
						>
							<motion.div
								className="absolute inset-x-0 top-0 bg-[rgb(var(--liquor-text-rgb)/0.7)]"
								initial={false}
								animate={{ height: fillHeight }}
								transition={reduce ? { duration: 0 } : SPRING_SOFT}
							/>
						</div>
						<ol className="contents">
							{anchors.map((a, i) => (
								<li key={a.n} className="absolute inset-x-0" style={{ top: a.top }}>
									<SteepMarker
										n={a.n}
										nEnd={a.nEnd}
										seconds={a.seconds}
										index={i}
										active={a.n === active}
										passed={activeIndex >= 0 && i < activeIndex}
										reduce={reduce}
										layoutGroup={slug}
										title={`${a.n === 0 ? "Rinse" : `Steep ${a.n}`} · “${a.match}”${
											isControl ? " · [ / ] to step" : ""
										}`}
										onSelect={() => goto(a.n)}
										onHover={setHovered}
									/>
								</li>
							))}
						</ol>
						{isControl && (
							<motion.div
								aria-hidden
								className="absolute inset-x-0 flex justify-center gap-0.5 text-[9px] text-white/25"
								style={{ top: railBottom + MARKER_H / 2 + 8 }}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.4 }}
							>
								<kbd className="px-1 border rounded-sm border-white/10">[</kbd>
								<kbd className="px-1 border rounded-sm border-white/10">]</kbd>
							</motion.div>
						)}
					</>
				) : schedule.length > 0 && mode ? (
					<div className="sticky top-[calc(var(--commandbar-h)+1.5rem)] flex flex-col gap-0.5">
						<span className="pr-1.5 pb-1 text-[9px] text-right uppercase tracking-wider text-white/25">
							plan
						</span>
						<ol className="flex flex-col gap-0.5">
							{schedule.map((s, i) => (
								<li key={s.n} className="relative h-5">
									<SteepMarker
										n={s.n}
										seconds={s.seconds}
										index={i}
										active={s.n === active}
										passed={false}
										reduce={reduce}
										layoutGroup={slug}
										title={`Planned steep ${s.n} · ${formatSeconds(
											s.seconds
										)} (not mentioned in the notes)`}
										onSelect={() => goto(s.n, { scroll: false })}
										onHover={setHovered}
									/>
								</li>
							))}
						</ol>
					</div>
				) : null}
			</nav>

			{children}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

function SteepMarker({
	n,
	nEnd,
	seconds,
	index,
	active,
	passed,
	reduce,
	layoutGroup,
	title,
	onSelect,
	onHover,
}: {
	n: number
	nEnd?: number
	seconds: number
	index: number
	active: boolean
	passed: boolean
	reduce: boolean
	layoutGroup: string
	title: string
	onSelect: () => void
	onHover: (n: number | null) => void
}) {
	const label = n === 0 ? "R" : String(n)
	// the rinse badge already reads "R"; spelling it out overflows the 48px gutter
	const time = n === 0 ? "" : seconds > 0 ? formatSeconds(seconds) : nEnd ? `–${nEnd}` : ""
	return (
		<motion.button
			type="button"
			title={title}
			aria-label={`${n === 0 ? "Rinse" : `Steep ${n}`}${seconds > 0 ? `, ${seconds} seconds` : ""}`}
			aria-current={active ? "step" : undefined}
			onClick={onSelect}
			onPointerEnter={() => onHover(n)}
			onPointerLeave={() => onHover(null)}
			onFocus={() => onHover(n)}
			onBlur={() => onHover(null)}
			initial={reduce ? false : { opacity: 0, x: -6 }}
			animate={{ opacity: 1, x: 0 }}
			transition={
				reduce ? { duration: 0 } : { ...SPRING_SNAPPY, delay: Math.min(index, 12) * 0.035 }
			}
			className={cn(
				"group relative flex items-center justify-between w-full h-5 pl-px pr-1.5 rounded-sm outline-none cursor-pointer",
				"text-[10px] leading-none tabular-nums",
				"hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-[rgb(var(--liquor-text-rgb)/0.8)]"
			)}
		>
			{active && (
				<motion.span
					aria-hidden
					layoutId={`steep-gutter-active-${layoutGroup}`}
					className="absolute inset-0 rounded-sm bg-[rgb(var(--liquor-rgb)/0.14)] shadow-[inset_-2px_0_0_var(--liquor-text)]"
					transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
				/>
			)}
			<span
				className={cn(
					"relative grid place-items-center size-[18px] rounded-full border text-[9px] font-semibold",
					"transition-[background-color,border-color,color] duration-200",
					active
						? "bg-[var(--liquor)] border-[var(--liquor)] text-[var(--liquor-ink)]"
						: passed
						? "bg-background border-[rgb(var(--liquor-text-rgb)/0.55)] text-white/75"
						: "bg-background border-white/15 text-white/45 group-hover:border-white/30 group-hover:text-white/75"
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"relative transition-colors duration-200",
					active
						? "text-white/90"
						: passed
						? "text-white/45"
						: "text-white/30 group-hover:text-white/60"
				)}
			>
				{time}
			</span>
		</motion.button>
	)
}
