"use client"

/**
 * Atlas labels (plan §4.7.4): countries, seas, provinces, cities, tea towns, origins, lakes and
 * rivers from public/maps/labels.json, set in screen space over the terrain.
 *
 * Which labels show is decided a few times a second while the camera moves (and once when it
 * settles): the zoom tier picks the ranks allowed, then a greedy pass places them in priority
 * order and drops any that would collide with one already placed, with the map's own chrome or
 * with its marks. Between passes the labels are pinned to the camera (camera.ts), so they move
 * rigidly with the map and panning never re-renders them.
 *
 * Steady through a zoom: a label that shows keeps showing until it really has to go. It stays
 * past its tier's threshold by a margin (hysteresis), keeps its side of the dot, may run a little
 * past the map's edge, and outranks newcomers by about a tier and a half, so only a much more
 * important label displaces it. Each label fades in and out (map.css); one that changes side
 * crossfades from the old side to the new.
 *
 * Type, like a printed atlas: spaced capitals for countries and seas (hanzi beneath), small
 * spaced capitals for provinces, a dot and a name for settlements, italic in a cooler ink for
 * water, rivers turned along their course. Hanzi from the subset font, beside the pinyin.
 */
import { memo, startTransition, useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion, type MotionValue } from "motion/react"
import { cn } from "@/lib/utils"
import { useMover, usePin, type Camera, type ViewTick } from "./camera"
import {
	LABEL_TIERS,
	LABELS_URL,
	SHARED,
	type LabelKind,
	type LabelsJson,
	type MapLabel,
} from "./geo"
import { useMapJson } from "./mapData"

/** A mark the labels keep clear of: a point in shared units, a radius in px (or a px box around it). */
export type Obstacle = { x: number; y: number; r: number; box?: [number, number, number, number] }
/** px rect within the map: [x0, y0, x1, y1] */
export type Rect = [number, number, number, number]

const KIND_ORDER: Record<LabelKind, number> = {
	country: 0,
	sea: 1,
	province: 2,
	city: 3,
	origin: 3,
	town: 4,
	lake: 5,
	river: 6,
}

/**
 * How early a tier comes in: the pipeline's thresholds are where a rank becomes *safe* on a
 * ~1000 px map; collision and the per-area cap already keep a crowded view legible, so the
 * runtime lets each tier in a little sooner (towns before you're right on top of them).
 */
const TIER_LEAD = 1.6

/**
 * The tier a view is at: the highest rank whose maxUnitsPerPx still admits it, or, on a small
 * map (a 240 px panel shows little ground at any scale), whose viewKm still covers the view.
 * Collision and the per-area cap keep a small map from crowding either way.
 */
export function tierFor(upp: number, viewKm = Infinity, lead = TIER_LEAD): number {
	let tier = 0
	for (const t of LABEL_TIERS)
		if (t.maxUnitsPerPx == null || upp <= t.maxUnitsPerPx * lead || viewKm <= t.viewKm * lead)
			tier = t.rank
	return tier
}

/** A label already showing stays this much past its tier's threshold (zoomed out) */
const TIER_STAY = 1.3
/** ...and counts this many ranks more important than a newcomer, in collisions */
const STAY_BONUS = 1.5
/** ...and may run this far (px) past the map's edge before it goes */
const STAY_EDGE = 24
/** ms a leaving label stays in the DOM: its fade (220 ms, map.css), and a little more */
const FADE_OUT_MS = 260

type Side = "c" | "r" | "l"
type Placed = { l: MapLabel; side: Side }

const DOT_GAP = 6
const PAD = 3

/** Approximate box (px) of a label's text: Fira Code advances 0.6 em, hanzi 1 em. */
function measure(l: MapLabel): { w: number; h: number } {
	const n = l.name.length
	const m = l.name_zh?.length ?? 0
	switch (l.kind) {
		case "country":
			return { w: Math.max(n * 11 * 1.02, m * 13), h: m ? 25 : 11 }
		case "sea":
			return { w: Math.max(n * 9.5 * 0.92, m * 12.85), h: m ? 23.5 : 10 }
		case "province":
			return { w: n * 9 * 0.86 + (m ? 4.5 + m * 10.6 : 0), h: 10 }
		case "river":
		case "lake":
			return { w: n * 9.5 * 0.74 + (m ? 4.3 + m * 10.1 : 0), h: 10 }
		case "town":
		case "origin":
			return { w: n * 5.7 + (m ? 4 + m * 9.5 : 0), h: 10 }
		default:
			return { w: n * 6 + (m ? 4 + m * 9.5 : 0), h: 10 }
	}
}

const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

function place(
	labels: MapLabel[],
	{ view: [vx, vy, vw, vh], W, H, upp }: ViewTick,
	opts: {
		skip?: (l: MapLabel) => boolean
		obstacles: Obstacle[]
		reserved: Rect[]
		/** what shows now, and on which side */
		prev: Map<string, Side>
	}
): Placed[] {
	const viewKm = SHARED.unitsToKm(vw, SHARED.invert(0, vy + vh / 2)[1])
	const enter = tierFor(upp, viewKm)
	const stay = tierFor(upp, viewKm, TIER_LEAD * TIER_STAY)
	const toPx = (x: number, y: number) => [(x - vx) / upp, (y - vy) / upp] as const
	const cands: { l: MapLabel; sx: number; sy: number; was: Side | undefined; rank: number }[] = []
	for (const l of labels) {
		const was = opts.prev.get(l.id)
		if (l.rank > (was ? stay : enter) || opts.skip?.(l)) continue
		const [sx, sy] = toPx(l.x, l.y)
		if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue
		cands.push({ l, sx, sy, was, rank: l.rank - (was ? STAY_BONUS : 0) })
	}
	cands.sort(
		(a, b) =>
			a.rank - b.rank || KIND_ORDER[a.l.kind] - KIND_ORDER[b.l.kind] || (a.l.id < b.l.id ? -1 : 1)
	)
	const obstacles: Rect[] = opts.obstacles.map((o) => {
		const [sx, sy] = toPx(o.x, o.y)
		return o.box
			? [sx + o.box[0], sy + o.box[1], sx + o.box[2], sy + o.box[3]]
			: [sx - o.r, sy - o.r, sx + o.r, sy + o.r]
	})
	const taken: Rect[] = [...opts.reserved]
	const out: Placed[] = []
	const names: { name: string; x: number; y: number }[] = []
	const cap = Math.max(6, Math.min(70, (W * H) / 6500))
	let edge = 2
	const fits = (r: Rect) =>
		r[0] >= edge &&
		r[1] >= edge &&
		r[2] <= W - edge &&
		r[3] <= H - edge &&
		!taken.some((t) => overlaps(r, t)) &&
		!obstacles.some((t) => overlaps(r, t))
	for (const { l, sx, sy, was } of cands) {
		edge = was ? -STAY_EDGE : 2
		if (out.length >= cap) break
		// a country, sea or province is named once per view, whatever anchors it has
		if (
			(l.kind === "country" || l.kind === "sea" || l.kind === "province") &&
			names.some((n) => n.name === l.name)
		)
			continue
		// one anchor per river (or name) in a stretch of map (one showing keeps its place a little
		// closer in, so a zoom back and forth doesn't toggle the second)
		if (
			(l.kind === "river" || l.kind === "lake") &&
			names.some((n) => n.name === l.name && Math.hypot(n.x - sx, n.y - sy) < (was ? 170 : 220))
		)
			continue
		const { w, h } = measure(l)
		let r: Rect | null = null
		let side: Placed["side"] = "c"
		if (l.kind === "city" || l.kind === "town" || l.kind === "origin") {
			const right: Rect = [sx - 3, sy - h / 2 - PAD, sx + DOT_GAP + w + PAD, sy + h / 2 + PAD]
			const left: Rect = [sx - DOT_GAP - w - PAD, sy - h / 2 - PAD, sx + 3, sy + h / 2 + PAD]
			// the side it was on, first
			const order: [Rect, Side][] =
				was === "l"
					? [
							[left, "l"],
							[right, "r"],
					  ]
					: [
							[right, "r"],
							[left, "l"],
					  ]
			for (const [box, sd] of order)
				if (fits(box)) {
					;[r, side] = [box, sd]
					break
				}
		} else if (l.kind === "river" && l.angle) {
			const a = (l.angle * Math.PI) / 180
			const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
			const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))
			const box: Rect = [sx - bw / 2 - PAD, sy - bh / 2 - PAD, sx + bw / 2 + PAD, sy + bh / 2 + PAD]
			if (fits(box)) r = box
		} else {
			const box: Rect = [sx - w / 2 - PAD, sy - h / 2 - PAD, sx + w / 2 + PAD, sy + h / 2 + PAD]
			if (fits(box)) r = box
		}
		if (!r) continue
		taken.push(r)
		out.push({ l, side })
		names.push({ name: l.name, x: sx, y: sy })
	}
	return out
}

/** A label in the DOM: placed, or fading out (`out`). Keyed by id and side. */
type Shown = Placed & { key: string; out: boolean }

const keyOf = (p: Placed) => `${p.l.id}:${p.side}`

export default function MapLabels({
	camera,
	skip,
	obstacles,
	reserved,
	fade,
	className,
}: {
	camera: Camera
	skip?: (l: MapLabel) => boolean
	obstacles?: Obstacle[]
	/** px rects the chrome occupies (measured on each pass) */
	reserved?: () => Rect[]
	fade?: MotionValue<number>
	className?: string
}) {
	const data = useMapJson<LabelsJson>(LABELS_URL)
	const mover = useMover(camera)
	const [items, setItems] = useState<Shown[]>([])
	/** what's in the DOM (ahead of the transition that renders it) */
	const shown = useRef<Shown[]>([])
	const outAt = useRef(new Map<string, number>())
	const sweep = useRef(0)
	// the latest inputs, read by the throttled pass
	const inputs = useRef({ skip, obstacles, reserved })
	useLayoutEffect(() => {
		inputs.current = { skip, obstacles, reserved }
	})

	useEffect(() => {
		if (!data) return
		/** what shows now, and on which side (the pass keeps it where it can) */
		const prevOf = () => {
			const m = new Map<string, Side>()
			for (const it of shown.current) if (!it.out) m.set(it.l.id, it.side)
			return m
		}
		/**
		 * Hand the DOM the next set: new labels come in (fading up), labels no longer placed stay
		 * a moment marked `out` (fading away), and leave once faded.
		 */
		const commit = (next: Placed[]) => {
			const now = performance.now()
			const nextBy = new Map(next.map((p) => [keyOf(p), p] as const))
			const out: Shown[] = []
			let changed = false
			let fading = false
			for (const it of shown.current) {
				const p = nextBy.get(it.key)
				if (p) {
					nextBy.delete(it.key)
					outAt.current.delete(it.key)
					if (it.out) changed = true
					out.push(it.out ? { ...it, out: false } : it)
				} else if (!it.out) {
					changed = true
					fading = true
					outAt.current.set(it.key, now)
					out.push({ ...it, out: true })
				} else if (now - (outAt.current.get(it.key) ?? 0) < FADE_OUT_MS) {
					fading = true
					out.push(it)
				} else {
					changed = true
					outAt.current.delete(it.key)
				}
			}
			for (const [key, p] of nextBy) {
				changed = true
				out.push({ ...p, key, out: false })
			}
			if (fading) {
				// come back for the faded ones
				window.clearTimeout(sweep.current)
				sweep.current = window.setTimeout(
					() => commit(shown.current.filter((it) => !it.out)),
					FADE_OUT_MS + 20
				)
			}
			if (!changed) return
			shown.current = out
			// a non-urgent render: React slices it around the frames the camera is drawing
			startTransition(() => setItems(out))
		}
		/** labels placed by the last pass that weren't showing: they come in if this one agrees */
		let waiting = new Set<string>()
		/**
		 * moving: a newcomer shows once two passes running have placed it, so a fast zoom doesn't
		 * flash the labels it only passes through; at rest (or for new inputs) at once
		 */
		const pass = (moving: boolean) => {
			const tick = camera.tick()
			if (!tick.W) return
			const { skip, obstacles = [], reserved } = inputs.current
			const prev = prevOf()
			const placed = place(data.labels, tick, {
				skip,
				obstacles,
				reserved: reserved?.() ?? [],
				prev,
			})
			const fresh = new Set<string>()
			const next = placed.filter((p) => {
				if (!moving || prev.has(p.l.id) || waiting.has(p.l.id)) return true
				fresh.add(p.l.id)
				return false
			})
			waiting = fresh
			commit(next)
		}
		let last = 0
		let timer = 0
		const run = (moving = false) => {
			last = performance.now()
			pass(moving)
		}
		const onTick = () => {
			window.clearTimeout(timer)
			const since = performance.now() - last
			// a few passes a second while moving, and one when it settles
			if (since > 160) run(true)
			timer = window.setTimeout(run, 140)
		}
		const off = camera.subscribe(onTick)
		// a changed skip / obstacle list reruns the pass
		const again = window.setTimeout(run, 30)
		return () => {
			off()
			window.clearTimeout(timer)
			window.clearTimeout(again)
			window.clearTimeout(sweep.current)
		}
	}, [data, camera, skip, obstacles])

	return (
		<motion.div
			aria-hidden
			className={cn("absolute inset-0 overflow-hidden pointer-events-none map-label", className)}
			style={fade ? { opacity: fade } : undefined}
		>
			{/* a pan moves this box, not each label */}
			<div ref={mover} className="absolute inset-0">
				{items.map((it) => (
					<Label key={it.key} l={it.l} side={it.side} out={it.out} />
				))}
			</div>
		</motion.div>
	)
}

const Label = memo(function Label({ l, side, out }: { l: MapLabel; side: Side; out: boolean }) {
	const pin = usePin(l.x, l.y)
	const state = out ? "" : undefined
	if (l.kind === "city" || l.kind === "town" || l.kind === "origin") {
		return (
			<div className={`map-place map-place-${l.kind}`} ref={pin} data-out={state}>
				<span className="map-place-ink">
					<span className="map-place-dot" />
					<span
						className="absolute top-0 -translate-y-1/2"
						style={side === "l" ? { right: DOT_GAP } : { left: DOT_GAP }}
					>
						{l.name}
						{l.name_zh && <span className="ml-1 map-place-zh">{l.name_zh}</span>}
					</span>
				</span>
			</div>
		)
	}
	const turn = l.kind === "river" && l.angle ? ` rotate(${l.angle}deg)` : ""
	return (
		<div className={`map-place map-place-${l.kind}`} ref={pin} data-out={state}>
			<span
				className="absolute left-0 top-0 map-place-ink"
				style={{ transform: `translate(-50%, -50%)${turn}` }}
			>
				<span className="map-place-name">{l.name}</span>
				{l.name_zh && <span className="map-place-zh">{l.name_zh}</span>}
			</span>
		</div>
	)
})
