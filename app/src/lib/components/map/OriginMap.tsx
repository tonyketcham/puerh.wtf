"use client"

/**
 * An origin on the terrain (plan §4.5, §4.7): the Properties inset, the peek card's strip and the
 * origin page's hero. A TerrainMap framed on the origin (the square v2's patch had), whose detail
 * cells are just the finest layer of the one shared world, so the reader can zoom out to Yunnan
 * and Laos and pan to the next mountain.
 *
 * - the contours of the cells in view rise from low to high as they draw on (stagger by band)
 * - the contour nearest the session's recorded elevation is re-stroked in its liquor and
 *   tagged: "your tea grew on this line"; a garden range lights its bands in the accent
 * - precision-coded marker at the point, one liquor ring per session
 * - when the origin changes and both ends lie in the Yunnan frame, the camera flies from one to
 *   the other over the terrain instead of swapping pictures
 * - several origins (a blend) frame them all, with a dotted hull: the blend region
 * - the caption opens the origin page, the map growing into its hero (view transition); the
 *   peek, a preview, opens it from anywhere
 *
 * Framing comes from the manifest's per-origin index (point, framing square, elevations), so the
 * camera is aimed and the marks placed before any terrain arrives. Renders nothing when no origin
 * has detail coverage (callers keep their fallback).
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type MouseEvent,
	type ReactNode,
} from "react"
import { motion, useReducedMotion } from "motion/react"
import {
	isPlainClick,
	navigateWithMorph,
	ORIGIN_MAP_CLASS,
	originMapTransitionName,
} from "@/lib/components/entity/page/viewTransition"
import { cn } from "@/lib/utils"
import {
	boundsOf,
	convexHull,
	DETAIL_INTERVAL,
	DETAILS,
	EASE,
	fmtLat,
	fmtLon,
	fmtMeters,
	inYunnan,
	ringInk,
	SPRING,
	unprojectShared,
	type Box,
	type CellJson,
	type MapLabel,
	type OriginDetail,
} from "./geo"
import { useMapJsonAll } from "./mapData"
import { pinAt } from "./camera"
import type { Obstacle } from "./MapLabels"
import { AreaMark, CenterDot, PxGroup, Rings } from "./Marks"
import TerrainMap, { useTerrainMap } from "./TerrainMap"
import { detailOpacity, focusCells, prefetchLayersFor, type TerrainFocus } from "./TerrainLayers"

export type OriginMapOrigin = { slug: string; title: string; hanzi?: string | null }

/**
 * - panel: Properties › Provenance (plan §3.4), ~240×140, chrome on hover
 * - peek:  the EntityPeek origin card (plan §3.1), a 296×84 strip, a preview (no gestures)
 * - hero:  the origin page's map (plan §3.2), Tanaka contours
 */
export type OriginMapVariant = "panel" | "peek" | "hero"

const DETAIL_BY_SLUG = new Map(DETAILS.map((d) => [d.id, d] as const))

/** Whether any of these origins has detail coverage to frame it by. */
export const hasDetail = (origins: { slug: string }[]) =>
	origins.some((o) => DETAIL_BY_SLUG.has(o.slug))

type Scene = {
	key: string
	metas: OriginDetail[]
	origins: OriginMapOrigin[]
	rings: string[]
	elevation: number | null
	gardens: [number, number] | null
	accent: string
}

const DRAW: Record<OriginMapVariant, { total: (n: number) => number; duration: number }> = {
	panel: { total: () => 400, duration: 380 },
	// plan §3.1: 12 ms per elevation band
	peek: { total: (n) => n * 12, duration: 300 },
	hero: { total: () => 700, duration: 520 },
}

const RING: Record<OriginMapVariant, (n: number) => { base: number; step: number }> = {
	panel: () => ({ base: 5, step: 2.4 }),
	peek: (n) => ({ base: 4, step: Math.min(3.4, 30 / Math.max(1, n)) }),
	hero: (n) => ({ base: 6, step: Math.min(3.6, 46 / Math.max(1, n)) }),
}

export default function OriginMap({
	origins,
	rings,
	elevation = null,
	gardens = null,
	accent,
	variant,
	drawKey,
	href,
	heroSlug,
	caption,
	className,
	recordingKey,
	children,
}: {
	/** placed origins, the primary one first */
	origins: OriginMapOrigin[]
	/** one color per session at the primary point (inner ring first) */
	rings: string[]
	/** the session's recorded elevation (m) */
	elevation?: number | null
	/** the origin's typical garden range (m) */
	gardens?: [number, number] | null
	accent: string
	variant: OriginMapVariant
	/** redraw (and travel) when this changes, e.g. the session slug */
	drawKey: string
	/** the origin page (the caption, or the whole peek, opens it) */
	href?: string | null
	/** this is the origin page's hero for that slug: it receives the inset's morph */
	heroSlug?: string
	/** replaces the default caption (the hero's comment line) */
	caption?: ReactNode
	className?: string
	recordingKey?: string
	/** extra overlay content (the peek's caption) */
	children?: ReactNode
}) {
	const reduce = useReducedMotion() ?? false
	const router = useRouter()
	const ctl = useTerrainMap()
	const { camera } = ctl
	const labelRef = useRef<HTMLSpanElement>(null)

	const placed = useMemo(() => origins.filter((o) => DETAIL_BY_SLUG.has(o.slug)), [origins])
	const placedKey = placed.map((o) => o.slug).join(",")
	const sceneKey = `${drawKey}::${placedKey}`

	// The scene on screen, and the one it replaced (for the flight between them).
	const [scenes, setScenes] = useState<{ cur: Scene; prev: Scene | null } | null>(null)
	if (placed.length && (!scenes || scenes.cur.key !== sceneKey)) {
		setScenes({
			cur: {
				key: sceneKey,
				metas: placed.map((o) => DETAIL_BY_SLUG.get(o.slug)!),
				origins: placed,
				rings,
				elevation,
				gardens,
				accent,
			},
			prev: scenes?.cur ?? null,
		})
	}
	const cur = scenes?.cur ?? null
	const blend = !!cur && cur.metas.length > 1

	const meta = cur?.metas[0] ?? null
	const gardensRange = cur?.gardens ?? meta?.elevation_m ?? null

	// Travel: only between two single-origin scenes that both sit in the Yunnan frame.
	const travel = useMemo(() => {
		const prev = scenes?.prev
		if (!cur || !prev || reduce || variant !== "panel") return false
		const a = prev.metas[0]
		const b = cur.metas[0]
		if (!a || !b || prev.metas.length > 1 || blend || a.id === b.id) return false
		return inYunnan(a.point) && inYunnan(b.point)
	}, [cur, scenes?.prev, reduce, variant, blend])

	// Screen size: the framing depends on the box's aspect.
	const [size, setSize] = useState({ w: 0, h: 0 })
	useEffect(() => {
		const read = () => setSize({ w: camera.width.get(), h: camera.height.get() })
		read()
		const offs = [camera.width.on("change", read), camera.height.on("change", read)]
		return () => offs.forEach((off) => off())
	}, [camera])
	const aspect = size.w > 0 && size.h > 0 ? size.w / size.h : variant === "peek" ? 3.5 : 1.75
	const home = useMemo(() => (cur ? sceneBox(cur, variant, aspect) : null), [cur, variant, aspect])

	// Aim the camera when the scene changes (the first one before paint).
	useLayoutEffect(() => {
		if (!cur) return
		const box = sceneBox(cur, variant, camera.width.get() / (camera.height.get() || 1) || aspect)
		ctl.touched.current = false
		if (travel) {
			const [x0, y0] = scenes!.prev!.metas[0].point
			const [x1, y1] = cur.metas[0].point
			prefetchLayersFor(
				boundsOf(
					[
						[x0, y0],
						[x1, y1],
					],
					60
				)
			)
			void camera.fly(box)
		} else camera.set(box)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cur?.key])

	// Elevation tag on the highlighted contour, placed once the line has drawn (and before the cells
	// settle: the drawn-on copy it finds the line in then leaves the DOM; TerrainMap.tsx).
	const draw = DRAW[variant]
	const bandsN = meta?.elevations.length ?? 0
	const drawDelay = travel ? 380 : 60
	const highlightElev = useMemo(() => {
		if (!cur || blend || cur.elevation == null || !meta) return null
		let best: number | null = null
		for (const e of meta.elevations)
			if (best == null || Math.abs(e - cur.elevation) < Math.abs(best - cur.elevation)) best = e
		return best != null && Math.abs(best - cur.elevation) <= DETAIL_INTERVAL ? best : null
	}, [cur, blend, meta])

	// the cells the map opens on draw on in SVG (none when it opens too far out for detail)
	const cells = useMemo(
		() => (cur && home ? focusCells(cur.metas[0].region, home) : []),
		[cur, home]
	)
	const cellUrls = useMemo(() => cells.map((c) => c.url), [cells])
	const cellData = useMapJsonAll<CellJson>(cellUrls)
	// marks come in with the line work they sit on
	const ready = !cellUrls.length || !!cellData

	const focus = useMemo<TerrainFocus | null>(() => {
		if (!cur) return null
		const lit = ringInk(cur.accent)
		const g = gardensRange
		const elevation = blend ? null : cur.elevation
		const m = cur.metas[0]
		return {
			id: m.id,
			region: m.region,
			cells: cells,
			draw: {
				key: cur.key,
				delay: drawDelay,
				total: draw.total(bandsN),
				duration: draw.duration,
				reduce,
			},
			// the session's line in the detail cells, or the nearest contour of a coarser sheet (never
			// thinned; the garden range thins with its bands)
			highlight: (elev: number, interval: number) => {
				const line =
					interval === DETAIL_INTERVAL
						? highlightElev
						: elevation == null
						? null
						: Math.round(elevation / interval) * interval
				return elev === line
					? { color: lit, width: 1.35, keep: true }
					: g && elev >= g[0] && elev <= g[1]
					? { color: lit, width: 0.8, opacity: line == null ? 0.55 : 0.3 }
					: null
			},
			// lit around the origin, fading out past the framing square
			reach: { x: m.point[0], y: m.point[1], inner: m.side * 0.6, outer: m.side },
			ink: lit,
		}
	}, [cur, blend, gardensRange, drawDelay, draw, bandsN, reduce, highlightElev, cells])

	const [tag, setTag] = useState<{ key: string; x: number; y: number } | null>(null)
	useEffect(() => {
		if (!cur || highlightElev == null || variant === "peek") return
		const t = window.setTimeout(
			() => {
				const root = ctl.rootRef.current
				const paths = ctl.svgRef.current?.querySelectorAll<SVGPathElement>(
					`[data-focus="${cur.metas[0].id}"] path[data-highlight="${highlightElev}"]`
				)
				let p: { x: number; y: number; d: number } | null = null
				for (const path of paths ?? []) {
					const q = root ? nearestScreenPoint(path, root, cur.metas[0].point) : null
					if (q && (!p || q.d < p.d)) p = q
				}
				if (!p) return
				const { view, upp } = camera.tick()
				setTag({ key: cur.key, x: view[0] + p.x * upp, y: view[1] + p.y * upp })
			},
			reduce ? 50 : drawDelay + draw.total(bandsN) + 420
		)
		return () => window.clearTimeout(t)
	}, [cur, highlightElev, variant, reduce, drawDelay, draw, bandsN, camera, ctl])

	// the tag belongs to the detail line: it fades with the cells as the camera zooms out
	const tagRef = useRef<HTMLSpanElement | null>(null)
	useEffect(() => {
		if (!cur) return
		return camera.subscribe(({ view }) => {
			if (tagRef.current) tagRef.current.style.opacity = `${detailOpacity(view)}`
		})
	}, [camera, cur, tag])
	// pinned to its point on the line, written every frame (it isn't in a mover)
	const tagEl = useCallback(
		(el: HTMLSpanElement | null) => {
			tagRef.current = el
			const unpin = el && tag ? camera.pin(el, tag.x, tag.y, pinAt, true) : undefined
			return () => {
				tagRef.current = null
				unpin?.()
			}
		},
		[camera, tag]
	)

	const primary = cur?.origins[0] ?? null
	const onOpen = useCallback(
		(e: MouseEvent<HTMLElement>) => {
			if (!href || !primary || e.defaultPrevented || !isPlainClick(e)) return
			const ok = navigateWithMorph(router, href, labelRef.current, "origin", primary.slug, [
				{
					el: ctl.rootRef.current,
					name: originMapTransitionName(primary.slug),
					className: ORIGIN_MAP_CLASS,
				},
			])
			if (ok) e.preventDefault()
		},
		[href, primary, router, ctl]
	)

	const skipLabel = useCallback(
		(l: MapLabel) => l.kind === "origin" && placed.some((o) => l.id === `origin:${o.slug}`),
		[placed]
	)
	const ring = RING[variant](cur?.rings.length ?? 1)
	const obstacles = useMemo<Obstacle[]>(
		() =>
			cur?.metas.map((m) => ({
				x: m.point[0],
				y: m.point[1],
				r: ring.base + Math.max(0, (blend ? 1 : cur.rings.length) - 1) * ring.step + 4,
			})) ?? [],
		[cur, ring.base, ring.step, blend]
	)

	if (!placed.length) return null

	const [lon, lat] = cur ? unprojectShared(...cur.metas[0].point) : [0, 0]
	const radiusKm = meta ? Math.round((meta.radius / meta.unitsPerKm) * 10) / 10 : 0
	const readout =
		cur && !blend ? `${fmtLat(lat)} ${fmtLon(lon)}${radiusKm >= 1 ? ` ±${radiusKm} km` : ""}` : null

	const heroStyle = heroSlug
		? ({
				viewTransitionName: originMapTransitionName(heroSlug),
				viewTransitionClass: ORIGIN_MAP_CLASS,
		  } as CSSProperties)
		: undefined

	const defaultCaption =
		variant === "panel" && primary ? (
			<span
				className="block truncate map-label text-[9.5px] leading-none text-white/45"
				title={blend ? cur!.origins.map((o) => o.title).join(" · ") : undefined}
			>
				{href ? (
					<Link
						href={href}
						onClick={onOpen}
						prefetch={false}
						data-map-ui=""
						className="rounded-[2px] outline-none pointer-events-auto hover:text-white/80 focus-visible:ring-1 focus-visible:ring-white/50"
						aria-label={`Open ${primary.title}`}
					>
						{"// "}
						<span ref={labelRef}>{[primary.hanzi, primary.title].filter(Boolean).join(" ")}</span>
						<span className="text-white/30"> ↗</span>
					</Link>
				) : (
					<>
						{"// "}
						<span ref={labelRef}>{[primary.hanzi, primary.title].filter(Boolean).join(" ")}</span>
					</>
				)}
				{blend && <span className="text-white/30"> +{cur!.origins.length - 1}</span>}
			</span>
		) : null

	const map = (
		<TerrainMap
			variant={variant}
			controller={ctl}
			home={home}
			focus={focus}
			skipLabel={skipLabel}
			obstacles={obstacles}
			readout={readout}
			caption={caption ?? defaultCaption}
			label={primary ? `Map of ${primary.title}` : "Origin map"}
			className={cn(variant === "peek" && href && "cursor-pointer", className)}
			style={heroStyle}
			recordingKey={recordingKey}
			dataAttrs={{ "data-origin-map": primary?.slug }}
			marks={
				cur && ready ? (
					<SceneMarks scene={cur} variant={variant} reduce={reduce} drawDelay={drawDelay} />
				) : null
			}
		>
			{variant !== "peek" &&
				cur &&
				tag &&
				tag.key === cur.key &&
				highlightElev != null &&
				cur.elevation != null && (
					<span
						key={tag.key}
						ref={tagEl}
						className="absolute left-0 top-0 z-[5] pointer-events-none"
						style={{ color: ringInk(cur.accent) }}
						title={`nearest contour: ${fmtMeters(highlightElev)}`}
					>
						{/* where on the line: a dot and a hairline up to the tag */}
						<motion.span
							aria-hidden
							className="absolute -left-[2px] -top-[2px] size-[4px] rounded-full bg-current"
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							transition={SPRING}
						/>
						<motion.span
							aria-hidden
							className="absolute left-0 bottom-0 w-px h-[9px] bg-current opacity-60 origin-bottom"
							initial={{ scaleY: 0 }}
							animate={{ scaleY: 1 }}
							transition={{ duration: 0.25, ease: EASE, delay: 0.05 }}
						/>
						<motion.span
							className="absolute left-0 bottom-[9px] px-1 py-[3px] rounded-[3px] bg-[#121012]/90 ring-1 ring-inset ring-current/30 map-label text-[9.5px] leading-none whitespace-nowrap tabular-nums"
							initial={{ opacity: 0, x: "-50%", y: 3 }}
							animate={{ opacity: 1, x: "-50%", y: 0 }}
							transition={{ duration: 0.35, ease: EASE, delay: 0.12 }}
						>
							{fmtMeters(cur.elevation)}
						</motion.span>
					</span>
				)}
			{children}
		</TerrainMap>
	)

	if (variant === "peek" && href) {
		return (
			<Link
				href={href}
				onClick={onOpen}
				prefetch={false}
				aria-label={primary ? `Open ${primary.title}` : "Open the origin"}
				className="block rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
			>
				{map}
			</Link>
		)
	}
	return map
}

/**
 * What the camera frames for a scene: a blend's points with air around them; a single origin's
 * framing square (v2's patch) covering the viewport, a hair inside it (a wide panel crops it top
 * and bottom, a tall one at the sides).
 */
/**
 * The panel and hero open one "−" step (TerrainMap's zoom(2)) wider than the origin's own
 * square, so a little of the surrounding country shows; the peek stays a tight preview.
 */
const HOME_CONTEXT: Record<OriginMapVariant, number> = { panel: 2, hero: 2, peek: 1 }

function sceneBox(scene: Scene, variant: OriginMapVariant, aspect: number): Box {
	const k = HOME_CONTEXT[variant]
	if (scene.metas.length > 1) {
		const pts = scene.metas.map((m) => m.point)
		const span = Math.max(...scene.metas.map((m) => m.side)) * 0.35
		const [x, y, w, h] = boundsOf(pts, span * 0.5, span)
		const [cx, cy] = [x + w / 2, y + h / 2]
		const [W, H] = [w * 1.2 * k, h * 1.2 * k]
		return [cx - W / 2, cy - H / 2, W, H]
	}
	const meta = scene.metas[0]
	const [cx, cy] = meta.point
	const zoom = variant === "peek" ? 0.9 : 0.92
	const side = meta.side * zoom * k
	return aspect >= 1
		? [cx - side / 2, cy - side / (2 * aspect), side, side / aspect]
		: [cx - (side * aspect) / 2, cy - side / 2, side * aspect, side]
}

/** The marker and rings at the point (or a blend's points and hull). */
function SceneMarks({
	scene,
	variant,
	reduce,
	drawDelay,
}: {
	scene: Scene
	variant: OriginMapVariant
	reduce: boolean
	drawDelay: number
}) {
	const draw = DRAW[variant]
	const ring = RING[variant](scene.rings.length)
	const metas = scene.metas

	if (metas.length > 1) {
		const pts = metas.map((p) => p.point)
		const hull = convexHull(pts)
		const d = hull.length ? `M${hull.map((p) => p.join(" ")).join("L")}Z` : ""
		const color = ringInk(scene.rings[0] ?? scene.accent)
		return (
			<g className="pointer-events-none">
				{d && (
					<g fill="none" strokeLinejoin="round" strokeLinecap="round">
						<path
							d={d}
							stroke={color}
							strokeOpacity={0.08}
							strokeWidth={18}
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={d}
							stroke={color}
							strokeOpacity={0.55}
							strokeWidth={1}
							strokeDasharray="1 3"
							vectorEffect="non-scaling-stroke"
						/>
					</g>
				)}
				{metas.map((p, n) => (
					<PxGroup key={p.id} x={p.point[0]} y={p.point[1]}>
						<CenterDot precision={p.precision} />
						<Rings
							colors={[scene.rings[0] ?? scene.accent]}
							base={4}
							delay={0.2 + n * 0.06}
							reduce={reduce}
							drawKey={scene.key}
						/>
					</PxGroup>
				))}
			</g>
		)
	}

	const p = metas[0]
	if (!p) return null
	const [sx, sy] = p.point
	return (
		<g className="pointer-events-none">
			<AreaMark
				x={sx}
				y={sy}
				r={p.radius}
				precision={p.precision}
				alpha={variant === "peek" ? 0.8 : 1}
			/>
			<PxGroup x={sx} y={sy}>
				<CenterDot precision={p.precision} />
				<Rings
					colors={scene.rings}
					base={ring.base}
					step={ring.step}
					delay={(drawDelay + draw.total(p.elevations.length) * 0.6) / 1000}
					reduce={reduce}
					drawKey={scene.key}
				/>
			</PxGroup>
		</g>
	)
}

/** The point on a path nearest the origin's point (shared units), in px within `root`. */
function nearestScreenPoint(
	path: SVGPathElement,
	root: HTMLElement,
	[px, py]: [number, number]
): { x: number; y: number; d: number } | null {
	let len = 0
	try {
		len = path.getTotalLength()
	} catch {
		return null
	}
	if (!(len > 0)) return null
	const ctm = path.getScreenCTM()
	if (!ctm) return null
	const box = root.getBoundingClientRect()
	// the point itself carries the marker and rings: keep the tag off them
	const ox = ctm.a * px + ctm.c * py + ctm.e - box.left
	const oy = ctm.b * px + ctm.d * py + ctm.f - box.top
	const samples = 200
	let best: { x: number; y: number; d: number } | null = null
	// the stretch nearest the point, but only where it's on screen and clear of the marker
	for (let i = 0; i <= samples; i++) {
		const p = path.getPointAtLength((len * i) / samples)
		const sx = ctm.a * p.x + ctm.c * p.y + ctm.e - box.left
		const sy = ctm.b * p.x + ctm.d * p.y + ctm.f - box.top
		const d = (sx - ox) ** 2 + (sy - oy) ** 2
		if (d < 26 * 26) continue
		if (sx < 30 || sx > box.width - 30 || sy < 26 || sy > box.height - 20) continue
		if (!best || d < best.d) best = { x: sx, y: sy, d }
	}
	return best
}
