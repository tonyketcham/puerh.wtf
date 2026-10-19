"use client"

import "./map.css"
import { useRouter, useSearchParams } from "next/navigation"
import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from "react"
import { useAtomValue, useSetAtom, useStore } from "jotai"
import {
	AnimatePresence,
	motion,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
	useMotionValue,
	useSpring,
	useTransform,
	type MotionValue,
} from "motion/react"
import { Minus, Plus, Scan } from "lucide-react"
import { usePeekTrigger } from "@/lib/components/entity/peek/usePeekTrigger"
import { isPlainClick, navigateWithMorph } from "@/lib/components/entity/page/viewTransition"
import { explorerHoverAtom } from "@/lib/components/explorer/state"
import { entityHref } from "@/lib/entities"
import { matchesFilters, readFilters, replaceFilters } from "@/lib/filters"
import { sessionColor, sessionsOf, type RelationIndex } from "@/lib/relations"
import { commandBarAtom, relationIndexAtom } from "@/lib/store/sessionAtom"
import type { ExplorerSession } from "@/lib/types/session"
import { cn } from "@/lib/utils"
import { useCamera } from "./camera"
import FrameLayers, { activeFrame, Graticule } from "./FrameLayers"
import {
	boundsOf,
	convexHull,
	CREAM,
	EASE,
	FRAMES,
	frameMeta,
	MAP_ATTRIBUTION,
	niceKm,
	ringInk,
	SPRING,
	UNITS_PER_KM,
	type Box,
	type FrameJson,
	type Point,
} from "./geo"
import { cachedMapJson } from "./mapData"
import { mapLayersAtom } from "./mapState"
import { AreaMark, CenterDot, PxGroup, Rings, UnknownGlyph } from "./Marks"
import type { MapPoint } from "./points"
import RidgeLayer, { ridgePlacement, useRidges } from "./RidgeLayer"
import { StorageLabels, StorageMarks, useStorageLayer } from "./StorageLayer"
import { SupplyArcs, SupplyTags, useSupplyVendors, type SupplyPair } from "./SupplyLines"

/**
 * - index: /origins (plan §3.3, §4.5): ridgeline hero that flattens on scroll, camera,
 *   keyboard, Explorer cross-highlight, filter sync, layer toggles
 * - hero:  an origin page's map for a node without an inset (a county, a province, a
 *   country): framed on its descendants, no hero, no camera controls
 */
export type OriginsMapMode = "index" | "hero"

type Marker = {
	p: MapPoint
	/** direct sessions, oldest vintage first (inner ring) */
	sessions: ExplorerSession[]
	colors: string[]
	/** px radius of the outer ring */
	R: number
}

/** Rings: inner radius and step (px) */
const RING_BASE = 5
const RING_STEP = 2.2
/** how far scroll flattens the hero (px of page scroll) */
const FLATTEN_PX = 420
const FOCUS_MIN = 300

const yearOf = (s: ExplorerSession) => Math.trunc(Number(s.production_year)) || 0

export default function OriginsMap({
	points,
	mode = "index",
	fit,
	className,
	recordingKey,
}: {
	points: MapPoint[]
	mode?: OriginsMapMode
	/** hero: the origins to frame */
	fit?: string[]
	className?: string
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	const router = useRouter()
	const store = useStore()
	const index = useAtomValue(relationIndexAtom)
	const layers = useAtomValue(mapLayersAtom)
	const hover = useAtomValue(explorerHoverAtom)
	const params = useSearchParams()
	const { facets, q } = useMemo(() => readFilters(params), [params])
	const query = q.toLowerCase().trim()
	const interactive = mode === "index"

	const rootRef = useRef<HTMLDivElement>(null)
	const svgRef = useRef<SVGSVGElement>(null)
	const camera = useCamera(rootRef, svgRef)

	// -------------------------------------------------------------------------
	// Data
	// -------------------------------------------------------------------------

	const markers = useMemo(() => buildMarkers(points, index), [points, index])
	const bySlug = useMemo(() => new Map(markers.map((m) => [m.p.slug, m] as const)), [markers])
	const untasted = useMemo(
		() =>
			points.filter(
				(p) =>
					!bySlug.has(p.slug) && ["village", "mountain-area", "township", "forest"].includes(p.kind)
			),
		[points, bySlug]
	)
	const unknown = useMemo(() => points.filter((p) => p.kind === "unknown"), [points])
	const unknownCount = useMemo(
		() =>
			unknown.reduce(
				(n, p) => n + sessionsOf(index, "origin", p.slug, { rollup: false }).length,
				0
			),
		[unknown, index]
	)

	// rings pop in by vintage, oldest tea first
	const yearRank = useMemo(() => {
		const years = [...new Set(markers.flatMap((m) => m.sessions.map(yearOf)))].sort((a, b) => a - b)
		return new Map(years.map((y, i) => [y, i] as const))
	}, [markers])

	// Explorer filters (the year ruler, facets, the query) dim what they leave out
	const filtering = query.length > 0 || Object.values(facets).some((l) => l.length > 0)
	const passes = useMemo(() => {
		const out = new Map<string, boolean>()
		for (const s of index.sessions) out.set(s._slug, !filtering || matchesFilters(s, facets, query))
		return out
	}, [index, facets, query, filtering])

	// whatever the Explorer (or the map, or the tree) is pointing at lights its sessions' rings
	const lit = useMemo(() => {
		if (!hover) return null
		const sessions = sessionsOf(index, hover.kind, hover.slug)
		if (!sessions.length) return null
		const slugs = new Set(sessions.map((s) => s._slug))
		const origins = new Set<string>()
		for (const m of markers) if (m.sessions.some((s) => slugs.has(s._slug))) origins.add(m.p.slug)
		return { sessions: slugs, origins }
	}, [hover, index, markers])

	// blends: a session with several placed origins draws a dotted hull around them
	const hulls = useMemo(() => {
		const at = new Map<string, Point[]>()
		for (const m of markers)
			for (const s of m.sessions) at.set(s._slug, [...(at.get(s._slug) ?? []), [m.p.x, m.p.y]])
		return [...at]
			.filter(([, pts]) => pts.length >= 2)
			.map(([slug, pts]) => {
				const hull = convexHull(pts)
				const s = index.bySlug.get(slug)
				return {
					slug,
					color: s ? sessionColor(s) : CREAM,
					d: `M${hull.map((p) => `${p[0]} ${p[1]}`).join("L")}${hull.length > 2 ? "Z" : ""}`,
				}
			})
	}, [markers, index])

	// supply lines: one per (origin, vendor) pair
	const supply = useMemo<SupplyPair[]>(() => {
		const pairs = new Map<string, SupplyPair>()
		for (const m of markers)
			for (const s of m.sessions)
				for (const v of s.vendor || []) {
					const key = `${m.p.slug}>${v._slug}`
					const pair = pairs.get(key) ?? {
						origin: [m.p.x, m.p.y] as Point,
						vendor: v._slug,
						vendorTitle: v.title,
						count: 0,
					}
					pair.count++
					pairs.set(key, pair)
				}
		return [...pairs.values()]
	}, [markers])
	const vendors = useSupplyVendors(supply)

	// storage: where the aged teas sat, from each one's origin to its stores
	const originAt = useCallback(
		(slug: string): Point | null => {
			const m = bySlug.get(slug)
			return m ? [m.p.x, m.p.y] : null
		},
		[bySlug]
	)
	const storage = useStorageLayer(index.sessions, originAt)

	// -------------------------------------------------------------------------
	// Hero relief: scroll flattens the ridgelines into the plan view (index only)
	// -------------------------------------------------------------------------

	const ridges = useRidges()
	const { scrollY } = useScroll()
	// flattening starts once the (sticky) map has risen into place: the whole hero shows first
	const stickAt = useMotionValue(0)
	useEffect(() => {
		const el = rootRef.current
		if (!el || mode !== "index") return
		const measure = () => {
			const holder = el.parentElement
			const top = holder ? parseFloat(getComputedStyle(holder).top) || 0 : 0
			// the holder's natural position: its offset in the document, not where sticky put it
			holder?.style.setProperty("position", "static")
			const y = el.getBoundingClientRect().top + window.scrollY
			holder?.style.removeProperty("position")
			stickAt.set(Math.max(0, y - top))
		}
		measure()
		window.addEventListener("resize", measure)
		return () => window.removeEventListener("resize", measure)
	}, [mode, stickAt])
	const scrolled = useTransform([scrollY, stickAt], ([y, at]: number[]) =>
		Math.max(0, Math.min(1, 1 - (y - at) / FLATTEN_PX))
	)
	const pinned = useSpring(0, { stiffness: 110, damping: 22 })
	useEffect(() => {
		pinned.set(layers.ridges ? 1 : 0)
	}, [layers.ridges, pinned])
	/** the reader has moved the camera */
	const touched = useRef(false)
	// 1 while the index hero is (or will be) up; 0 on hero maps, or if the ridges never come
	// (and 0 for good once the reader takes the camera: scrolling back up then just scrolls)
	const heroOn = useSpring(mode === "index" ? 1 : 0, { stiffness: 120, damping: 24 })
	useEffect(() => {
		if (mode !== "index") return heroOn.set(0)
		if (touched.current) return
		if (ridges) return heroOn.set(1)
		const t = window.setTimeout(() => heroOn.set(0), 2500)
		return () => window.clearTimeout(t)
	}, [mode, ridges, heroOn])
	const relief = useTransform([scrolled, pinned, heroOn], ([a, b, h]: number[]) =>
		Math.max(a * h, b)
	)
	const mapDim = useTransform(relief, [0, 1], [1, 0.4])
	const overlayOpacity = useTransform(relief, [0, 0.45], [1, 0])
	const overlayEvents = useTransform(relief, (r): string => (r > 0.45 ? "none" : "auto"))

	// rings pop in once the plan view shows
	const [revealed, setRevealed] = useState(mode === "hero")
	useMotionValueEvent(relief, "change", (r) => {
		if (r < 0.5 && !revealed) setRevealed(true)
	})
	useEffect(() => {
		if (relief.get() < 0.5) setRevealed(true)
	}, [relief])

	// -------------------------------------------------------------------------
	// Camera
	// -------------------------------------------------------------------------

	/** the box the camera was last sent to (refit on resize); null once the reader pans */
	const preset = useRef<Box | null>(null)
	const [focus, setFocus] = useState<string | null>(null)
	const release = useCallback(() => {
		touched.current = true
		heroOn.set(0)
	}, [heroOn])

	const go = useCallback(
		(box: Box, how: "set" | "fly" = "fly") => {
			preset.current = box
			if (how === "set") camera.set(box)
			else return camera.fly(box, { reduce })
		},
		[camera, reduce]
	)

	const focusBox = useCallback((m: Marker): Box => {
		const side = Math.max(FOCUS_MIN, Math.min(900, m.p.r * 5))
		return [m.p.x - side / 2, m.p.y - side / 2, side, side]
	}, [])

	const fitBox = useMemo<Box | null>(() => {
		if (mode !== "hero") return null
		const pts = (fit ?? [])
			.map((s) => points.find((p) => p.slug === s))
			.filter(Boolean) as MapPoint[]
		if (!pts.length) return null
		// air around the points: their areas, but no more than ~45 km (a province would swallow the view)
		const pad = Math.max(40, Math.min(220, ...pts.map((p) => p.r * 1.1)))
		return boundsOf(
			pts.map((p) => [p.x, p.y]),
			pad,
			180
		)
	}, [mode, fit, points])

	// first frame: an ?at= origin, the hero's ridge box, or the hero map's own fit
	useLayoutEffect(() => {
		if (mode === "hero") {
			go(fitBox ?? frameMeta("yunnan").viewBox, "set")
			return
		}
		const at = new URLSearchParams(window.location.search).get("at")
		const m = at ? bySlug.get(at) : undefined
		if (m) {
			setFocus(m.p.slug)
			go(focusBox(m), "set")
		} else go(frameMeta("six-mountains").viewBox, "set")
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	// the ridges arrive: frame them (unless the reader has already moved)
	useEffect(() => {
		if (mode !== "index" || !ridges || touched.current || focus) return
		go(ridgePlacement(ridges).box, "set")
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ridges])
	// keep the framed box framed when the viewport resizes
	useEffect(() => {
		let raf = 0
		const refit = () => {
			cancelAnimationFrame(raf)
			raf = requestAnimationFrame(() => {
				if (preset.current && !camera.cx.isAnimating() && !camera.lw.isAnimating())
					camera.set(preset.current)
			})
		}
		refit()
		const offs = [camera.width.on("change", refit), camera.height.on("change", refit)]
		return () => {
			cancelAnimationFrame(raf)
			offs.forEach((off) => off())
		}
	}, [camera])

	// the view after it settles: scale bar, sheet label, which labels fit
	const [settled, setSettled] = useState<{ view: Box; W: number; H: number } | null>(null)
	useEffect(() => {
		let t = 0
		const read = () => {
			window.clearTimeout(t)
			t = window.setTimeout(
				() => setSettled({ view: camera.view(), W: camera.width.get(), H: camera.height.get() }),
				110
			)
		}
		read()
		const offs = [camera.cx, camera.cy, camera.lw, camera.width, camera.height].map((mv) =>
			mv.on("change", read)
		)
		return () => {
			window.clearTimeout(t)
			offs.forEach((off) => off())
		}
	}, [camera])

	// -------------------------------------------------------------------------
	// Focus, open, zoom
	// -------------------------------------------------------------------------

	// shallow URL: ?at=<slug> (no navigation; filters and other params kept)
	useEffect(() => {
		if (!interactive) return
		const url = new URL(window.location.href)
		if (focus) url.searchParams.set("at", focus)
		else url.searchParams.delete("at")
		const next = `${url.pathname}${url.search}${url.hash}`
		if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
			window.history.replaceState(null, "", next)
	}, [focus, interactive])

	const labelEls = useRef(new Map<string, HTMLElement>())
	const open = useCallback(
		(slug: string) => {
			const href = entityHref("origin", slug)
			if (!href) return
			if (!navigateWithMorph(router, href, labelEls.current.get(slug), "origin", slug))
				router.push(href)
		},
		[router]
	)

	const focusOn = useCallback(
		(m: Marker) => {
			release()
			setFocus(m.p.slug)
			go(focusBox(m))
		},
		[go, focusBox, release]
	)

	/** Click on a ring: a far-off cluster zooms to its sheet first; then focus; then open. */
	const activate = useCallback(
		(m: Marker) => {
			if (!interactive) return open(m.p.slug)
			if (focus === m.p.slug) return open(m.p.slug)
			const [, , vw] = camera.view()
			const sheet = [...FRAMES]
				.reverse()
				.find(
					(f) =>
						f.id !== "locator" &&
						m.p.x >= f.viewBox[0] &&
						m.p.x <= f.viewBox[0] + f.viewBox[2] &&
						m.p.y >= f.viewBox[1] &&
						m.p.y <= f.viewBox[1] + f.viewBox[3]
				)
			if (sheet && vw > sheet.viewBox[2] * 1.6) {
				release()
				setFocus(m.p.slug)
				go(sheet.viewBox)
				return
			}
			focusOn(m)
		},
		[interactive, focus, camera, go, focusOn, open, release]
	)

	const zoomOut = useCallback(() => {
		release()
		const [vx, vy, vw, vh] = camera.view()
		const c: Point = [vx + vw / 2, vy + vh / 2]
		const next = [...FRAMES]
			.reverse()
			.find(
				(f) =>
					f.viewBox[2] > vw * 1.15 &&
					c[0] >= f.viewBox[0] &&
					c[0] <= f.viewBox[0] + f.viewBox[2] &&
					c[1] >= f.viewBox[1] &&
					c[1] <= f.viewBox[1] + f.viewBox[3]
			)
		go(next?.viewBox ?? FRAMES[0].viewBox)
	}, [camera, go, release])

	const zoomBy = useCallback(
		(f: number, at?: Point) => {
			release()
			const [vx, vy, vw, vh] = camera.view()
			const [ax, ay] = at ?? [vx + vw / 2, vy + vh / 2]
			const w = Math.min(FRAMES[0].viewBox[2] * 1.3, Math.max(60, vw * f))
			const h = (vh / vw) * w
			// keep the anchor under the same screen spot
			const nx = ax - ((ax - vx) / vw) * w
			const ny = ay - ((ay - vy) / vh) * h
			go([nx, ny, w, h])
		},
		[camera, go, release]
	)

	// "f": filter the Explorer to the origins in view (again: put the old filter back)
	const viewFilter = useRef<string[] | null>(null)
	const [filteredToView, setFilteredToView] = useState(false)
	const toggleViewFilter = useCallback(() => {
		if (viewFilter.current) {
			const saved = viewFilter.current
			viewFilter.current = null
			setFilteredToView(false)
			replaceFilters((s) => ({ ...s, facets: { ...s.facets, origins: saved } }))
			return
		}
		const [vx, vy, vw, vh] = camera.view()
		const visible = markers
			.filter((m) => m.p.x >= vx && m.p.x <= vx + vw && m.p.y >= vy && m.p.y <= vy + vh)
			.map((m) => m.p.slug)
		if (!visible.length) return
		replaceFilters((s) => {
			viewFilter.current = s.facets.origins
			return { ...s, facets: { ...s.facets, origins: visible } }
		})
		setFilteredToView(true)
	}, [camera, markers])

	// keyboard (plan §4.5 step 6)
	const byLon = useMemo(() => [...markers].sort((a, b) => a.p.lon - b.p.lon), [markers])
	useEffect(() => {
		if (!interactive) return
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
			if (store.get(commandBarAtom).open) return
			const t = e.target as HTMLElement | null
			const inMap = !!t && !!rootRef.current?.contains(t)
			const free = !t || t === document.body || inMap
			if (!free || t?.closest("input, textarea, select, [contenteditable=true]")) return
			if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
				if (!byLon.length) return
				e.preventDefault()
				const i = byLon.findIndex((m) => m.p.slug === focus)
				const step = e.key === "ArrowRight" ? 1 : -1
				const next =
					byLon[
						(i < 0 ? (step > 0 ? 0 : byLon.length - 1) : i + step + byLon.length) % byLon.length
					]
				focusOn(next)
			} else if (e.key === "Enter") {
				if (!focus || (inMap && t?.closest("a, button"))) return
				e.preventDefault()
				open(focus)
			} else if (e.key === "Escape") {
				e.preventDefault()
				if (focus) setFocus(null)
				zoomOut()
			} else if (e.key === "f" && !e.shiftKey) {
				e.preventDefault()
				toggleViewFilter()
			} else if (e.key === "+" || e.key === "=") {
				e.preventDefault()
				zoomBy(0.5)
			} else if (e.key === "-" || e.key === "_") {
				e.preventDefault()
				zoomBy(2)
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [interactive, store, byLon, focus, focusOn, open, zoomOut, toggleViewFilter, zoomBy])

	// drag to pan, ⌘/ctrl-scroll (or pinch) to zoom, double-click to zoom in
	const drag = useRef<{
		id: number
		x: number
		y: number
		cx: number
		cy: number
		moved: boolean
	} | null>(null)
	const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (!interactive || e.button !== 0) return
		camera.stop()
		drag.current = {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			cx: camera.cx.get(),
			cy: camera.cy.get(),
			moved: false,
		}
	}
	const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const d = drag.current
		if (!d || d.id !== e.pointerId) return
		const dx = e.clientX - d.x
		const dy = e.clientY - d.y
		if (!d.moved && Math.hypot(dx, dy) < 3) return
		if (!d.moved) {
			d.moved = true
			e.currentTarget.setPointerCapture(e.pointerId)
			release()
			preset.current = null
		}
		const u = camera.upp()
		camera.cx.set(d.cx - dx * u)
		camera.cy.set(d.cy - dy * u)
	}
	const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (drag.current?.id === e.pointerId) drag.current = null
	}
	const toMap = useCallback(
		(clientX: number, clientY: number): Point => {
			const r = svgRef.current!.getBoundingClientRect()
			const [vx, vy] = camera.view()
			const u = camera.upp()
			return [vx + (clientX - r.left) * u, vy + (clientY - r.top) * u]
		},
		[camera]
	)
	const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
		if (!interactive) return
		zoomBy(0.5, toMap(e.clientX, e.clientY))
	}
	useEffect(() => {
		const el = rootRef.current
		if (!el || !interactive) return
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return
			e.preventDefault()
			release()
			preset.current = null
			camera.stop()
			const [ax, ay] = toMap(e.clientX, e.clientY)
			const [vx, vy, vw, vh] = camera.view()
			const f = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.01)))
			const w = Math.min(FRAMES[0].viewBox[2] * 1.3, Math.max(60, vw * f))
			const h = (vh / vw) * w
			const nx = ax - ((ax - vx) / vw) * w
			const ny = ay - ((ay - vy) / vh) * h
			camera.cx.set(nx + w / 2)
			camera.cy.set(ny + h / 2)
			camera.lw.set(Math.log(w))
		}
		el.addEventListener("wheel", onWheel, { passive: false })
		return () => el.removeEventListener("wheel", onWheel)
	}, [camera, interactive, toMap, release])

	// -------------------------------------------------------------------------
	// Labels: the biggest origins that fit, plus whatever is focused or lit
	// -------------------------------------------------------------------------

	// slug → which side of its rings the label sits (right unless that runs off the map)
	const labelled = useMemo(() => {
		const out = new Map<string, "r" | "l">()
		if (!settled) return out
		const [vx, vy, vw] = settled.view
		const k = settled.W / vw
		const boxes: [number, number, number, number][] = []
		const ranked = [...markers].sort(
			(a, b) =>
				Number(b.p.slug === focus) - Number(a.p.slug === focus) ||
				b.sessions.length - a.sessions.length
		)
		for (const m of ranked) {
			const sx = (m.p.x - vx) * k
			const sy = (m.p.y - vy) * k
			if (sx < 0 || sy < 0 || sx > settled.W || sy > settled.H) continue
			const w = labelText(m).length * 6.1 + 12
			const right: [number, number, number, number] = [
				sx + m.R + 4,
				sy - 8,
				sx + m.R + 4 + w,
				sy + 8,
			]
			const left: [number, number, number, number] = [
				sx - m.R - 4 - w,
				sy - 8,
				sx - m.R - 4,
				sy + 8,
			]
			const free = (box: [number, number, number, number]) =>
				box[0] >= 4 &&
				box[2] <= settled.W - 4 &&
				!boxes.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3]) &&
				// other markers' rings count as occupied too
				!markers.some((o) => {
					if (o === m) return false
					const ox = (o.p.x - vx) * k
					const oy = (o.p.y - vy) * k
					return ox + o.R > box[0] && ox - o.R < box[2] && oy + o.R > box[1] && oy - o.R < box[3]
				})
			const side = free(right)
				? "r"
				: free(left)
				? "l"
				: m.p.slug === focus
				? sx > settled.W / 2
					? "l"
					: "r"
				: null
			if (!side) continue
			boxes.push(side === "r" ? right : left)
			out.set(m.p.slug, side)
			if (out.size >= 16) break
		}
		return out
	}, [settled, markers, focus])

	const sheet = settled ? activeFrame(settled.view) : null
	const sheetData = sheet ? cachedMapJson<FrameJson>(sheet.url) : undefined
	const pxPerKm = settled ? (settled.W / settled.view[2]) * UNITS_PER_KM : 0
	const km = pxPerKm ? niceKm(pxPerKm, 72) : 0
	const focused = focus ? bySlug.get(focus) : undefined

	return (
		<div
			ref={rootRef}
			className={cn("relative overflow-hidden isolate bg-[#121012] select-none", className)}
			data-recording-key={recordingKey}
			data-origins-map={mode}
		>
			<svg
				ref={svgRef}
				className={cn(
					"absolute inset-0 block w-full h-full touch-none",
					interactive && "cursor-grab active:cursor-grabbing"
				)}
				preserveAspectRatio="xMidYMid slice"
				role="img"
				aria-label="Map of the origins: contours, rivers and one ring per session"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onDoubleClick={onDoubleClick}
			>
				<motion.g style={{ opacity: mapDim }}>
					<FrameLayers camera={camera} layers={layers} />
					<Graticule />
					{layers.storage && (
						<StorageMarks
							nodes={storage.nodes}
							arcs={storage.arcs}
							passes={passes}
							reduce={reduce}
						/>
					)}
					{layers.supply && <SupplyArcs pairs={supply} reduce={reduce} />}
					<MapMarks
						markers={markers}
						untasted={untasted}
						unknown={unknown}
						hulls={hulls}
						passes={passes}
						lit={lit}
						revealed={revealed}
						reduce={reduce}
					/>
				</motion.g>
				{ridges && mode === "index" && (
					<RidgeLayer ridges={ridges} relief={relief} reduce={reduce} />
				)}
			</svg>

			{/* rings, labels and leaders: HTML over the map, placed by the camera's CSS variables */}
			<motion.div
				className="absolute inset-0 overflow-hidden pointer-events-none"
				style={{ opacity: overlayOpacity }}
			>
				{layers.storage && <StorageLabels nodes={storage.nodes} />}
				{layers.supply && <SupplyTags vendors={vendors} camera={camera} />}
				{revealed &&
					markers.map((m) => (
						<OriginMarker
							key={m.p.slug}
							m={m}
							focused={focus === m.p.slug}
							labelled={
								labelled.has(m.p.slug) ||
								focus === m.p.slug ||
								(hover?.kind === "origin" && hover.slug === m.p.slug)
							}
							side={labelled.get(m.p.slug) ?? "r"}
							lit={lit}
							passes={passes}
							yearRank={yearRank}
							reduce={reduce}
							events={overlayEvents}
							onActivate={activate}
							labelEls={labelEls}
						/>
					))}
				{unknownCount > 0 &&
					// only where it can't crowd: zoomed in to about a province
					!!settled &&
					settled.view[2] < 3000 &&
					unknown.map((p) => (
						<span
							key={p.slug}
							className="absolute left-0 top-0 map-label text-[10px] leading-none text-white/35 whitespace-nowrap"
							style={place(p.x, p.y, 0, 0)}
						>
							<span className="absolute left-3 -translate-y-1/2">
								{`// ${p.hanzi ?? ""} somewhere · ${unknownCount} unplaced`}
							</span>
						</span>
					))}
			</motion.div>

			{interactive && (
				<MapChrome
					sheet={sheet?.id ?? null}
					interval={sheetData?.interval ?? null}
					km={km}
					pxPerKm={pxPerKm}
					focused={focused ?? null}
					filteredToView={filteredToView}
					onZoomIn={() => zoomBy(0.5)}
					onZoomOut={() => zoomBy(2)}
					onReset={() => {
						setFocus(null)
						release()
						go(frameMeta("yunnan").viewBox)
					}}
					onOpen={() => focus && open(focus)}
					onToggleViewFilter={toggleViewFilter}
					relief={relief}
				/>
			)}
			{!interactive && km > 0 && (
				<div className="absolute left-3 bottom-2.5 text-[9.5px] text-white/40 pointer-events-none">
					<ScaleBar km={km} px={km * pxPerKm} />
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

function buildMarkers(points: MapPoint[], index: RelationIndex): Marker[] {
	const out: Marker[] = []
	for (const p of points) {
		if (p.kind === "unknown") continue
		const sessions = sessionsOf(index, "origin", p.slug, { rollup: false }).sort(
			(a, b) => yearOf(a) - yearOf(b)
		)
		if (!sessions.length) continue
		out.push({
			p,
			sessions,
			colors: sessions.map(sessionColor),
			R: RING_BASE + (sessions.length - 1) * RING_STEP,
		})
	}
	return out
}

const labelText = (m: Marker) =>
	`// ${m.p.hanzi ? `${m.p.hanzi} ` : ""}${m.p.title} · ${m.sessions.length}`

/** CSS position of a shared-space point in the overlay (see camera.ts). */
function place(x: number, y: number, dx: number, dy: number) {
	return {
		transform: `translate3d(calc(var(--k) * ${x}px + var(--ox) * 1px + ${dx}px), calc(var(--k) * ${y}px + var(--oy) * 1px + ${dy}px), 0)`,
	}
}

// ---------------------------------------------------------------------------
// SVG marks: areas, hulls, untasted points
// ---------------------------------------------------------------------------

const MapMarks = memo(function MapMarks({
	markers,
	untasted,
	unknown,
	hulls,
	passes,
	lit,
	revealed,
	reduce,
}: {
	markers: Marker[]
	untasted: MapPoint[]
	unknown: MapPoint[]
	hulls: { slug: string; color: string; d: string }[]
	passes: Map<string, boolean>
	lit: { sessions: Set<string>; origins: Set<string> } | null
	revealed: boolean
	reduce: boolean
}) {
	return (
		<motion.g
			className="pointer-events-none"
			initial={false}
			animate={{ opacity: revealed ? 1 : 0 }}
			transition={{ duration: reduce ? 0.2 : 0.6, ease: EASE }}
		>
			{unknown.map((p) => (
				<g key={p.slug}>
					<AreaMark x={p.x} y={p.y} r={p.r} precision="unknown" alpha={0.8} />
					<PxGroup x={p.x} y={p.y}>
						<UnknownGlyph />
					</PxGroup>
				</g>
			))}
			{markers.map((m) => (
				<AreaMark
					key={m.p.slug}
					x={m.p.x}
					y={m.p.y}
					r={m.p.r}
					precision={m.p.precision}
					alpha={m.sessions.some((s) => passes.get(s._slug)) ? 1 : 0.35}
					lit={!!lit?.origins.has(m.p.slug)}
				/>
			))}
			{hulls.map((h) => {
				const on = passes.get(h.slug) !== false
				const hot = !!lit?.sessions.has(h.slug)
				const ink = ringInk(h.color)
				return (
					<g key={h.slug} fill="none" strokeLinejoin="round" strokeLinecap="round">
						<path
							d={h.d}
							stroke={ink}
							strokeOpacity={hot ? 0.14 : on ? 0.06 : 0.02}
							strokeWidth={22}
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={h.d}
							stroke={ink}
							strokeOpacity={hot ? 0.9 : on ? 0.5 : 0.12}
							strokeWidth={1}
							strokeDasharray="1 3.5"
							vectorEffect="non-scaling-stroke"
						/>
					</g>
				)
			})}
			{untasted.map((p) => (
				<PxGroup key={p.slug} x={p.x} y={p.y}>
					<circle r={1.4} fill={CREAM} fillOpacity={0.28}>
						<title>{`${p.title} · not yet tasted`}</title>
					</circle>
				</PxGroup>
			))}
		</motion.g>
	)
})

// ---------------------------------------------------------------------------
// One origin: rings, label, peek, click
// ---------------------------------------------------------------------------

function OriginMarker({
	m,
	focused,
	labelled,
	side,
	lit,
	passes,
	yearRank,
	reduce,
	events,
	onActivate,
	labelEls,
}: {
	m: Marker
	focused: boolean
	labelled: boolean
	side: "r" | "l"
	lit: { sessions: Set<string>; origins: Set<string> } | null
	passes: Map<string, boolean>
	yearRank: Map<number, number>
	reduce: boolean
	events: MotionValue<string>
	onActivate: (m: Marker) => void
	labelEls: React.RefObject<Map<string, HTMLElement>>
}) {
	const slug = m.p.slug
	const setHover = useSetAtom(explorerHoverAtom)
	const unhover = () => setHover((h) => (h?.kind === "origin" && h.slug === slug ? null : h))
	const target = useMemo(() => ({ kind: "origin" as const, key: slug }), [slug])
	const { handlers } = usePeekTrigger<HTMLAnchorElement>(target)
	const [pointer, setPointer] = useState(false)
	const isLit = !!lit?.origins.has(slug)
	const dimmedByLit = !!lit && !isLit
	const dimmed = m.sessions.map(
		(s) => passes.get(s._slug) === false || (!!lit && !lit.sessions.has(s._slug))
	)
	const hot = m.sessions.map((s) => !!lit?.sessions.has(s._slug))
	const anyPass = m.sessions.some((s) => passes.get(s._slug) !== false)
	const size = (m.R + 12) * 2
	const hit = m.R + 6
	const href = entityHref("origin", slug) ?? "#"
	// a leader from the map's left edge, when the Explorer (not this ring) points here
	const leader = isLit && !pointer

	return (
		<motion.a
			href={href}
			{...handlers}
			aria-label={`${m.p.title}: ${m.sessions.length} ${
				m.sessions.length === 1 ? "session" : "sessions"
			}`}
			className="absolute left-0 top-0 rounded-full outline-none group focus-visible:ring-1 focus-visible:ring-white/50"
			style={{
				...place(m.p.x, m.p.y, 0, 0),
				// a real box around the rings (hit area, peek anchor); content hangs off its center
				width: hit * 2,
				height: hit * 2,
				marginLeft: -hit,
				marginTop: -hit,
				pointerEvents: events,
			}}
			onPointerEnter={(e) => {
				handlers.onPointerEnter(e)
				setPointer(true)
				setHover({ kind: "origin", slug })
			}}
			onPointerLeave={(e) => {
				handlers.onPointerLeave(e)
				setPointer(false)
				unhover()
			}}
			onFocus={(e) => {
				handlers.onFocus(e)
				setHover({ kind: "origin", slug })
			}}
			onBlur={(e) => {
				handlers.onBlur(e)
				unhover()
			}}
			onClick={(e) => {
				handlers.onClick(e)
				if (e.defaultPrevented || !isPlainClick(e)) return
				e.preventDefault()
				onActivate(m)
			}}
			data-origin={slug}
		>
			<span className="absolute left-1/2 top-1/2">
				{leader && (
					<motion.span
						aria-hidden
						className="absolute top-0 h-px origin-right bg-[#fff2ca]/35 pointer-events-none"
						style={{
							right: m.R + 6,
							width: `calc(var(--k) * ${m.p.x}px + var(--ox) * 1px - ${m.R + 6}px)`,
						}}
						initial={{ scaleX: 0 }}
						animate={{ scaleX: 1 }}
						transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
					/>
				)}
				<svg
					width={size}
					height={size}
					viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
					className="absolute overflow-visible"
					style={{ left: -size / 2, top: -size / 2 }}
					aria-hidden
				>
					{/* hit area */}
					<circle r={m.R + 6} fill="transparent" />
					<motion.g
						initial={false}
						animate={{ opacity: dimmedByLit ? 0.35 : anyPass ? 1 : 0.45 }}
						transition={{ duration: 0.25 }}
					>
						<Rings
							colors={m.colors}
							base={RING_BASE}
							step={RING_STEP}
							reduce={reduce}
							dimmed={dimmed}
							lit={hot}
							delays={m.sessions.map(
								(s, i) => 0.1 + (yearRank.get(yearOf(s)) ?? 0) * 0.07 + i * 0.01
							)}
						/>
						<CenterDot precision={m.p.precision} />
					</motion.g>
					{isLit && !reduce && (
						<motion.circle
							r={m.R + 3}
							fill="none"
							stroke={CREAM}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
							initial={{ scale: 1, opacity: 0.6 }}
							animate={{ scale: 1.6, opacity: 0 }}
							transition={{ duration: 1.1, ease: "easeOut", repeat: Infinity }}
						/>
					)}
					{(focused || pointer) && (
						<motion.circle
							r={m.R + 5}
							fill="none"
							stroke={CREAM}
							strokeOpacity={focused ? 0.8 : 0.4}
							strokeWidth={1}
							strokeDasharray="2 3"
							vectorEffect="non-scaling-stroke"
							initial={{ opacity: 0, scale: 0.8 }}
							animate={{ opacity: 1, scale: 1, rotate: reduce ? 0 : 360 }}
							transition={{
								opacity: { duration: 0.2 },
								scale: SPRING,
								rotate: { duration: 24, ease: "linear", repeat: Infinity },
							}}
						/>
					)}
				</svg>
				<AnimatePresence>
					{labelled && (
						<motion.span
							className={cn(
								"absolute top-0 whitespace-nowrap map-label text-[10.5px] leading-none pointer-events-none",
								focused || pointer || isLit ? "text-white/90" : "text-white/50"
							)}
							style={side === "r" ? { left: m.R + 6, y: "-50%" } : { right: m.R + 6, y: "-50%" }}
							initial={{ opacity: 0, x: side === "r" ? -4 : 4 }}
							animate={{ opacity: anyPass || isLit ? 1 : 0.5, x: 0 }}
							exit={{ opacity: 0, x: side === "r" ? -4 : 4 }}
							transition={{ duration: 0.25, ease: EASE }}
						>
							<span className="px-1 py-0.5 rounded-[3px] bg-[#121012]/80">
								<span className="text-white/30">{"// "}</span>
								{m.p.hanzi && <span className="mr-1">{m.p.hanzi}</span>}
								<span
									ref={(el) => {
										if (el) labelEls.current.set(slug, el)
										else labelEls.current.delete(slug)
									}}
									className="uppercase tracking-[0.1em] text-[9.5px]"
								>
									{m.p.pinyin ?? m.p.title}
								</span>
								<span className="text-white/35 tabular-nums"> · {m.sessions.length}</span>
							</span>
						</motion.span>
					)}
				</AnimatePresence>
			</span>
		</motion.a>
	)
}

// ---------------------------------------------------------------------------
// Chrome: sheet label, zoom controls, keys, scale, attribution
// ---------------------------------------------------------------------------

function MapChrome({
	sheet,
	interval,
	km,
	pxPerKm,
	focused,
	filteredToView,
	onZoomIn,
	onZoomOut,
	onReset,
	onOpen,
	onToggleViewFilter,
	relief,
}: {
	sheet: string | null
	interval: number | null
	km: number
	pxPerKm: number
	focused: Marker | null
	filteredToView: boolean
	onZoomIn: () => void
	onZoomOut: () => void
	onReset: () => void
	onOpen: () => void
	onToggleViewFilter: () => void
	relief: MotionValue<number>
}) {
	const heroOpacity = useTransform(relief, [0.2, 0.9], [0, 1])
	const chromeOpacity = useTransform(relief, [0.2, 0.9], [1, 0.35])
	const sheetOpacity = useTransform(relief, [0.2, 0.6], [1, 0])
	return (
		<>
			{/* hero caption, while the ridges stand */}
			<motion.div
				className="absolute left-4 top-3.5 pointer-events-none text-[10.5px] leading-relaxed text-white/45"
				style={{ opacity: heroOpacity }}
				aria-hidden
			>
				<p>
					<span className="text-white/25">{"// "}</span>six ancient tea mountains · 36 west–east
					profiles
				</p>
				<p className="text-white/25">{"// scroll to lay them flat"}</p>
			</motion.div>

			<motion.div
				className="absolute left-4 top-3.5 flex items-center gap-2 text-[10.5px] text-white/45 pointer-events-none"
				style={{ opacity: sheetOpacity }}
			>
				<AnimatePresence mode="popLayout" initial={false}>
					{focused ? (
						<motion.span
							key={`f-${focused.p.slug}`}
							className="flex items-center gap-2"
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.2, ease: EASE }}
						>
							<span className="text-white/80">
								<span className="text-white/35">^ </span>
								{focused.p.slug}.origin
							</span>
							<span className="tabular-nums">
								{focused.sessions.length} {focused.sessions.length === 1 ? "session" : "sessions"}
							</span>
							<button
								type="button"
								onClick={onOpen}
								className="pointer-events-auto px-1.5 h-5 rounded-[3px] ring-1 ring-inset ring-white/15 text-white/70 hover:text-white hover:ring-white/40 outline-none focus-visible:ring-white/60"
							>
								open ↵
							</button>
						</motion.span>
					) : (
						<motion.span
							key={`s-${sheet}`}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.2, ease: EASE }}
						>
							<span className="text-white/25">{"// "}</span>
							{sheet ?? "…"}.frame
							{interval ? (
								<span className="text-white/30"> · contours every {interval} m</span>
							) : null}
						</motion.span>
					)}
				</AnimatePresence>
			</motion.div>

			<motion.div
				className="absolute right-3 top-3 flex items-center gap-1"
				style={{ opacity: chromeOpacity }}
			>
				{filteredToView && (
					<button
						type="button"
						onClick={onToggleViewFilter}
						className="h-6 px-2 mr-1 text-[10px] rounded-[4px] bg-[#121012]/85 ring-1 ring-inset ring-[#edc446]/40 text-[#edc446] outline-none hover:ring-[#edc446]/80 focus-visible:ring-[#edc446]"
						title="Explorer filtered to the origins in view (f)"
					>
						filtered to view · f
					</button>
				)}
				<ChromeButton label="Zoom out (−)" onClick={onZoomOut}>
					<Minus size={12} strokeWidth={2} />
				</ChromeButton>
				<ChromeButton label="Zoom in (+)" onClick={onZoomIn}>
					<Plus size={12} strokeWidth={2} />
				</ChromeButton>
				<ChromeButton label="Back to Yunnan" onClick={onReset}>
					<Scan size={12} strokeWidth={2} />
				</ChromeButton>
			</motion.div>

			<div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-4 pointer-events-none text-[9.5px] leading-none text-white/40">
				<span className="flex items-center gap-4">
					{km > 0 && <ScaleBar km={km} px={km * pxPerKm} />}
					<span className="hidden truncate whitespace-nowrap text-white/30 2xl:inline">
						← → origins · ↵ open · esc out · f filter to view · ⌘/ctrl scroll zoom
					</span>
				</span>
				<span className="text-right text-white/25 truncate" title={MAP_ATTRIBUTION.join("\n")}>
					terrain: AWS Terrain Tiles · Natural Earth
				</span>
			</div>
		</>
	)
}

function ChromeButton({
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
			className="grid size-6 place-items-center rounded-[4px] bg-[#121012]/85 ring-1 ring-inset ring-white/[0.1] text-white/55 outline-none transition-colors hover:text-white hover:ring-white/30 focus-visible:ring-white/60"
		>
			{children}
		</button>
	)
}

function ScaleBar({ km, px }: { km: number; px: number }) {
	const w = Math.round(px)
	return (
		<span className="flex items-center gap-1.5">
			<svg width={w + 2} height={7} aria-hidden className="overflow-visible">
				<path
					d={`M1 1V6H${w + 1}V1`}
					fill="none"
					stroke={CREAM}
					strokeOpacity={0.45}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={`M${Math.round(w / 2) + 1} 3.5V6`}
					stroke={CREAM}
					strokeOpacity={0.3}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<span className="tabular-nums whitespace-nowrap">
				{km < 1 ? `${km * 1000} m` : `${km.toLocaleString("en-US")} km`}
			</span>
		</span>
	)
}
