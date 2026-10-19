"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"
import {
	layoutNextRichInlineLineRange,
	materializeRichInlineLineRange,
	prepareRichInline,
	type RichInlineCursor,
	type RichInlineItem,
} from "@chenglou/pretext/rich-inline"
import { cn } from "@/lib/utils/cn"

/** Fired on window after the article's lines are rebuilt: anything holding Ranges re-collects. */
export const ARTICLE_REFLOW_EVENT = "session-article-reflow"

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Clearance (px) between the cube's outline and the text beside it. */
const GAP_X = 28
const GAP_Y = 14
/** A column beside the cube narrower than this is left empty instead of holding a sliver of text. */
const MIN_SLOT = 140
/** Below this width per side, the cube stacks above the notes instead of sitting inside them. */
const MIN_COLUMN = 180
const BLOCK_SELECTOR = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,pre"
/** Inline elements a flowed block may contain; anything else (img, code…) keeps its block whole. */
const FLOWABLE_INLINE = new Set(["A", "STRONG", "EM", "B", "I", "SPAN", "U", "S", "DEL", "MARK", "ABBR", "BR"])

type Mode = "pending" | "wrap" | "stack"
type Point = { x: number; y: number }
type Polygon = Point[]

// ---------------------------------------------------------------------------
// Geometry: the cube's outline as polygons in article coordinates
// ---------------------------------------------------------------------------

/** Layout offset of `el` inside `ancestor` (untransformed: hover/entrance scales don't move text). */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): Point {
	let x = 0
	let y = 0
	for (let node: HTMLElement | null = el; node && node !== ancestor; ) {
		x += node.offsetLeft
		y += node.offsetTop
		node = node.offsetParent as HTMLElement | null
	}
	return { x, y }
}

/** Every [data-flow-shape] inside the obstacle, as a polygon rotated by its data-flow-rotate. */
function readShapes(obstacle: HTMLElement): Polygon[] {
	const shapes: Polygon[] = []
	for (const el of Array.from(obstacle.querySelectorAll<HTMLElement>("[data-flow-shape]"))) {
		const { x, y } = offsetWithin(el, obstacle)
		const w = el.offsetWidth
		const h = el.offsetHeight
		if (!w || !h) continue
		const rad = (Number(el.dataset.flowRotate ?? 0) * Math.PI) / 180
		const cos = Math.cos(rad)
		const sin = Math.sin(rad)
		const cx = x + w / 2
		const cy = y + h / 2
		shapes.push(
			[
				[-w / 2, -h / 2],
				[w / 2, -h / 2],
				[w / 2, h / 2],
				[-w / 2, h / 2],
			].map(([dx, dy]) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }))
		)
	}
	return shapes
}

function bounds(shapes: Polygon[]) {
	const pts = shapes.flat()
	return {
		minX: Math.min(...pts.map((p) => p.x)),
		maxX: Math.max(...pts.map((p) => p.x)),
		minY: Math.min(...pts.map((p) => p.y)),
		maxY: Math.max(...pts.map((p) => p.y)),
	}
}

/** Horizontal extent of a convex polygon within the band [y0, y1], or null if they don't meet. */
function bandExtent(poly: Polygon, y0: number, y1: number): [number, number] | null {
	let lo = Infinity
	let hi = -Infinity
	const take = (x: number) => {
		lo = Math.min(lo, x)
		hi = Math.max(hi, x)
	}
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]
		const b = poly[(i + 1) % poly.length]
		if (a.y >= y0 && a.y <= y1) take(a.x)
		for (const y of [y0, y1]) {
			if ((a.y - y) * (b.y - y) < 0) take(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
		}
	}
	return lo <= hi ? [lo, hi] : null
}

// ---------------------------------------------------------------------------
// Flowing one block: pretext lays it out row by row, around the cube
// ---------------------------------------------------------------------------

type Piece = { item: number; text: string }

function isFlowable(block: Element) {
	for (const el of Array.from(block.querySelectorAll("*"))) {
		if (!FLOWABLE_INLINE.has(el.tagName)) return false
	}
	return true
}

function canvasFont(cs: CSSStyleDeclaration) {
	return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
}

/**
 * Rebuilds `block` as absolutely placed lines that skip the blocked span of every row.
 * Each source character lands in exactly one line, so the block's text (and every Range-based
 * highlighter reading it) is unchanged; collapsible spaces at line ends just don't paint.
 */
function flowBlock(
	block: HTMLElement,
	top: number,
	left: number,
	blocked: (y0: number, y1: number) => [number, number] | null
): boolean {
	const cs = getComputedStyle(block)
	const fontSize = parseFloat(cs.fontSize)
	const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.2
	const padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)
	const padT = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth)
	const width = block.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
	const contentTop = top + padT
	const contentLeft = left + padL

	// text nodes, split into hard-break segments at each <br> (pretext only wraps; it has no forced breaks)
	const nodes: Text[] = []
	const segments: number[][] = [[]]
	const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeName === "BR") segments.push([])
		else if (node instanceof Text && node.data) {
			segments[segments.length - 1].push(nodes.length)
			nodes.push(node)
		}
	}
	if (!nodes.length) return false

	const items: RichInlineItem[] = nodes.map((node) => {
		const ps = getComputedStyle(node.parentElement!)
		const spacing = parseFloat(ps.letterSpacing)
		return {
			text: node.data,
			font: canvasFont(ps),
			...(spacing ? { letterSpacing: spacing } : {}),
		}
	})
	// line slots in reading order, row by row: one full-width slot, or a slot each side of the cube
	type Slot = { x: number; y: number; w: number }
	const queued: Slot[] = []
	let row = 0
	const peekSlot = (): Slot | null => {
		while (!queued.length) {
			if (row >= 2000) return null
			const y = row++ * lineHeight
			const hit = blocked(contentTop + y, contentTop + y + lineHeight)
			queued.push(
				...(hit
					? [
							{ x: 0, y, w: hit[0] - contentLeft },
							{ x: hit[1] - contentLeft, y, w: width - (hit[1] - contentLeft) },
					  ].filter((s) => s.w >= MIN_SLOT)
					: [{ x: 0, y, w: width }])
			)
		}
		return queued[0]
	}

	// each segment fills slots from the one after the last segment's final line. A <br> with
	// nothing before the next one is a blank line: it ends the current row, or blanks the next
	// whole row (a lone empty slot beside the cube would read as a hole, not a break). A
	// trailing <br> adds none (as in CSS).
	const lines: { x: number; y: number; fragments: { item: number; sourceStart: number }[] }[] = []
	segments.forEach((seg, s) => {
		let placed = false
		if (seg.length) {
			const prepared = prepareRichInline(seg.map((i) => items[i]))
			let cursor: RichInlineCursor | undefined
			for (let slot = peekSlot(); slot; slot = peekSlot()) {
				const range = layoutNextRichInlineLineRange(prepared, slot.w, cursor)
				if (!range) break
				const { fragments } = materializeRichInlineLineRange(prepared, range)
				lines.push({
					x: slot.x,
					y: slot.y,
					fragments: fragments.map((f) => ({ item: seg[f.itemIndex], sourceStart: f.sourceStart })),
				})
				queued.shift()
				cursor = range.end
				placed = true
			}
		}
		const slot = !placed && s < segments.length - 1 ? peekSlot() : null
		if (slot) {
			lines.push({ x: 0, y: slot.y, fragments: [] })
			queued.length = 0
		}
	})
	if (!lines.some((l) => l.fragments.length)) return false
	const rows = Math.round(Math.max(...lines.map((l) => l.y)) / lineHeight) + 1

	// hand every character of every text node to one line: a fragment owns its item's text up to
	// the next fragment of that item (so break spaces stay in the DOM); items with no fragment
	// (whitespace between tags or <br>s) ride along on the line before them. The <br>s themselves
	// stay out: the slots already encode them, and they carry no text.
	const pieces: Piece[][] = lines.map(() => [])
	const flat = lines.flatMap((line, li) => line.fragments.map((f) => ({ f, li })))
	let lastLine = 0
	let k = 0
	for (let item = 0; item < items.length; item++) {
		const text = items[item].text
		const own: typeof flat = []
		while (k < flat.length && flat[k].f.item === item) own.push(flat[k++])
		if (!own.length) {
			pieces[lastLine].push({ item, text })
			continue
		}
		own.forEach(({ f, li }, j) => {
			const start = j === 0 ? 0 : f.sourceStart
			const end = j + 1 < own.length ? own[j + 1].f.sourceStart : text.length
			pieces[li].push({ item, text: text.slice(start, end) })
			lastLine = li
		})
	}

	const chains = nodes.map((node) => {
		const chain: Element[] = []
		for (let el = node.parentElement; el && el !== block; el = el.parentElement) chain.unshift(el)
		return chain
	})

	const out = lines.map((line, li) => {
		const row = document.createElement("span")
		row.style.cssText = `position:absolute;left:${line.x}px;top:${line.y}px;white-space:nowrap`
		for (const { item, text } of pieces[li]) {
			let leaf: Node = document.createTextNode(text)
			for (let i = chains[item].length - 1; i >= 0; i--) {
				const wrap = chains[item][i].cloneNode(false)
				wrap.appendChild(leaf)
				leaf = wrap
			}
			row.appendChild(leaf)
		}
		return row
	})

	block.replaceChildren(...out)
	block.style.position = "relative"
	block.style.height = `${rows * lineHeight}px`
	return true
}

// ---------------------------------------------------------------------------

export interface FlowAroundArticleProps {
	html: string
	/** Sits centered inside the notes; its [data-flow-shape] descendants are what text avoids */
	obstacle?: ReactNode
}

/**
 * The session write-up, with the photo cube set into the middle of it and the prose flowing
 * around both sides of its tilted outline (CSS floats can only push text to one side).
 *
 * Owns [data-session-article]'s DOM: only the blocks beside the cube are rebuilt, line by line,
 * and their original nodes go back before every relayout. Everyone else still only measures it;
 * ARTICLE_REFLOW_EVENT says when Ranges into it went stale.
 */
export default function FlowAroundArticle({ html, obstacle }: FlowAroundArticleProps) {
	const rootRef = useRef<HTMLDivElement>(null)
	const obstacleRef = useRef<HTMLDivElement>(null)
	const articleRef = useRef<HTMLElement>(null)

	useLayoutEffect(() => {
		const root = rootRef.current
		const article = articleRef.current
		const cube = obstacleRef.current
		if (!root || !article) return

		const originals = new Map<HTMLElement, Node[]>()
		const restore = () => {
			for (const [block, nodes] of originals) {
				block.replaceChildren(...nodes)
				block.style.position = ""
				block.style.height = ""
				block.style.marginTop = ""
			}
			originals.clear()
		}
		const setMode = (mode: Mode) => {
			root.dataset.flow = mode
			if (mode !== "wrap" && cube) {
				cube.style.left = ""
				cube.style.top = ""
				root.style.minHeight = ""
			}
		}

		const relayout = () => {
			restore()
			const shapes = cube ? readShapes(cube) : []
			if (!cube || !shapes.length) return setMode("stack")

			const width = article.clientWidth
			const box = bounds(shapes)
			const cubeW = box.maxX - box.minX
			if ((width - cubeW) / 2 - GAP_X < MIN_COLUMN) return setMode("stack")

			// the cube starts where the first paragraph does, centered between the margins
			const articleRect = article.getBoundingClientRect()
			const firstP = article.querySelector("p")
			const anchorTop = firstP ? firstP.getBoundingClientRect().top - articleRect.top : 0
			const dx = (width - cubeW) / 2 - box.minX
			const dy = anchorTop - box.minY
			const placed = shapes.map((poly) => poly.map((p) => ({ x: p.x + dx, y: p.y + dy })))
			const exTop = box.minY + dy - GAP_Y
			const exBottom = box.maxY + dy + GAP_Y

			const blocked = (y0: number, y1: number): [number, number] | null => {
				let lo = Infinity
				let hi = -Infinity
				for (const poly of placed) {
					const span = bandExtent(poly, y0 - GAP_Y, y1 + GAP_Y)
					if (!span) continue
					lo = Math.min(lo, span[0])
					hi = Math.max(hi, span[1])
				}
				return lo <= hi ? [lo - GAP_X, hi + GAP_X] : null
			}

			const leaves = Array.from(article.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
				(el) => !el.querySelector(BLOCK_SELECTOR)
			)
			for (const block of leaves) {
				// top-down: every flowed block above may have grown and pushed this one
				const rect = block.getBoundingClientRect()
				const top = rect.top - articleRect.top
				if (top + rect.height < exTop) continue
				if (top > exBottom) break
				const nodes = Array.from(block.childNodes)
				if (
					isFlowable(block) &&
					flowBlock(block, top, rect.left - articleRect.left, blocked)
				) {
					originals.set(block, nodes)
				} else if (blocked(top, top + rect.height)) {
					// can't split it (code, images, tables): clear the cube instead
					originals.set(block, nodes)
					block.style.marginTop = `${exBottom - top + parseFloat(getComputedStyle(block).marginTop)}px`
				}
			}

			cube.style.left = `${dx}px`
			cube.style.top = `${dy}px`
			root.style.minHeight = `${box.maxY + dy}px`
			setMode("wrap")
		}

		let frame = 0
		let lastWidth = -1
		const run = () => {
			lastWidth = article.clientWidth
			try {
				relayout()
			} catch (error) {
				console.error("FlowAroundArticle: falling back to a stacked cube", error)
				restore()
				setMode("stack")
			}
			window.dispatchEvent(new Event(ARTICLE_REFLOW_EVENT))
		}
		const queue = () => {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(run)
		}

		run()
		// only width changes reflow the text; our own height changes must not loop back here
		const ro = new ResizeObserver(() => article.clientWidth !== lastWidth && queue())
		ro.observe(article)
		// the cube settles its size after mount (it measures itself)
		const cubeRo = cube ? new ResizeObserver(queue) : null
		if (cube) cubeRo!.observe(cube)
		let cancelled = false
		document.fonts?.ready.then(() => !cancelled && queue())

		return () => {
			cancelled = true
			cancelAnimationFrame(frame)
			ro.disconnect()
			cubeRo?.disconnect()
			restore()
		}
	}, [html])

	return (
		<div ref={rootRef} className="group/flow relative" data-flow="pending">
			{obstacle && (
				<div
					ref={obstacleRef}
					className={cn(
						"relative z-10 w-max mx-auto mb-12",
						"group-data-[flow=pending]/flow:absolute group-data-[flow=pending]/flow:invisible",
						"group-data-[flow=wrap]/flow:absolute group-data-[flow=wrap]/flow:m-0"
					)}
				>
					{obstacle}
				</div>
			)}

			<article
				ref={articleRef}
				className="prose prose-invert max-w-none transition-opacity duration-300 group-data-[flow=pending]/flow:opacity-0"
				data-session-article
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	)
}
