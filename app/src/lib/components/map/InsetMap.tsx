"use client"

import "./map.css"
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
	type PointerEvent,
	type ReactNode,
} from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { entityHref } from "@/lib/entities"
import {
	isPlainClick,
	navigateWithMorph,
	ORIGIN_MAP_CLASS,
	originMapTransitionName,
} from "@/lib/components/entity/page/viewTransition"
import { cn } from "@/lib/utils"
import { useCamera } from "./camera"
import { ContextLines, ContourLines, TanakaBands } from "./Contours"
import {
	boundsOf,
	convexHull,
	CREAM,
	EASE,
	fmtLat,
	fmtLon,
	fmtMeters,
	frameMeta,
	GROUND,
	insetLonLat,
	insetUrl,
	inYunnan,
	niceKm,
	ringInk,
	SPRING,
	UNITS_PER_KM,
	type Box,
	type FrameJson,
	type InsetJson,
} from "./geo"
import { useMapJson, useMapJsonAll } from "./mapData"
import { AreaMark, CenterDot, PxGroup, Rings } from "./Marks"

export type InsetMapOrigin = { slug: string; title: string; hanzi?: string | null }

/**
 * - panel: Properties › Provenance (plan §3.4), ~276×160, full chrome
 * - peek:  the EntityPeek origin card (plan §3.1), a 296×84 strip, no chrome (the card has its own)
 * - hero:  the origin page's map (plan §3.2), Tanaka contours, scale bar only
 */
export type InsetVariant = "panel" | "peek" | "hero"

/** Whether any of these origins has a precomputed inset to draw. */
export const hasInset = (origins: { slug: string }[]) => origins.some((o) => !!insetUrl(o.slug))

type Scene = {
	key: string
	insets: InsetJson[]
	origins: InsetMapOrigin[]
	rings: string[]
	elevation: number | null
	gardens: [number, number] | null
	accent: string
}

const DRAW: Record<InsetVariant, { total: (n: number) => number; duration: number }> = {
	panel: { total: () => 400, duration: 380 },
	// plan §3.1: 12 ms per elevation band
	peek: { total: (n) => n * 12, duration: 300 },
	hero: { total: () => 700, duration: 520 },
}

const RING: Record<InsetVariant, (n: number) => { base: number; step: number }> = {
	panel: () => ({ base: 5, step: 2.4 }),
	peek: (n) => ({ base: 4, step: Math.min(3.4, 30 / Math.max(1, n)) }),
	hero: (n) => ({ base: 6, step: Math.min(3.6, 46 / Math.max(1, n)) }),
}

/**
 * A per-origin contour inset (plan §4.5): the precomputed local square for the origin,
 * placed in the shared projection so the camera can travel between origins.
 *
 * - contours rise from low to high as they draw on (stagger by band)
 * - the contour nearest the session's recorded elevation is re-stroked in its liquor and
 *   labelled: "your tea grew on this line"; a garden range lights its bands in the accent
 * - precision-coded marker at the point, one liquor ring per session
 * - index contours slide ±2 px against the pointer (relief without 3D)
 * - when the origin changes and both ends lie in the Yunnan frame, the camera springs from
 *   one to the other over the Yunnan contours instead of swapping pictures
 * - several origins (a blend) frame them all, with a dotted hull: the blend region
 * - a click opens the origin page, the map growing into its hero (view transition)
 *
 * Renders nothing when no origin has an inset (callers keep their own fallback).
 */
export default function InsetMap({
	origins,
	rings,
	elevation = null,
	gardens = null,
	accent,
	variant,
	drawKey,
	href,
	heroSlug,
	className,
	recordingKey,
	children,
}: {
	/** placed origins, the primary one first */
	origins: InsetMapOrigin[]
	/** one color per session at the primary point (inner ring first) */
	rings: string[]
	/** the session's recorded elevation (m) */
	elevation?: number | null
	/** the origin's typical garden range (m) */
	gardens?: [number, number] | null
	accent: string
	variant: InsetVariant
	/** redraw (and travel) when this changes, e.g. the session slug */
	drawKey: string
	/** click target (the origin page); omit for a static map */
	href?: string | null
	/** this is the origin page's hero for that slug: it receives the inset's morph */
	heroSlug?: string
	className?: string
	recordingKey?: string
	/** extra overlay content (the hero's comment line) */
	children?: ReactNode
}) {
	const reduce = useReducedMotion() ?? false
	const router = useRouter()
	const rootRef = useRef<HTMLDivElement>(null)
	const svgRef = useRef<SVGSVGElement>(null)
	const labelRef = useRef<HTMLSpanElement>(null)
	const camera = useCamera(rootRef, svgRef)

	const originsKey = origins.map((o) => o.slug).join(",")
	const urls = useMemo(
		() => [...new Set(origins.map((o) => insetUrl(o.slug)).filter((u): u is string => !!u))],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[originsKey]
	)
	const loaded = useMapJsonAll<InsetJson>(urls)
	const sceneKey = `${drawKey}::${urls.join("|")}`

	// The scene on screen, and the one it replaced (kept while the camera travels away from it).
	const [scenes, setScenes] = useState<{ cur: Scene; prev: Scene | null } | null>(null)
	if (loaded && (!scenes || scenes.cur.key !== sceneKey)) {
		setScenes({
			cur: {
				key: sceneKey,
				insets: loaded,
				origins: origins.filter((o) => insetUrl(o.slug)),
				rings,
				elevation,
				gardens: gardens ?? loaded[0]?.origin.elevation_m ?? null,
				accent,
			},
			prev: scenes?.cur ?? null,
		})
	}
	const cur = scenes?.cur ?? null
	const blend = !!cur && cur.insets.length > 1

	// Travel: only between two single-origin scenes that both sit in the Yunnan frame.
	const travel = useMemo(() => {
		const prev = scenes?.prev
		if (!cur || !prev || reduce || variant === "hero") return false
		const a = prev.insets[0]?.shared.point
		const b = cur.insets[0]?.shared.point
		if (!a || !b || prev.insets[0].id === cur.insets[0].id) return false
		return inYunnan(a) && inYunnan(b)
	}, [cur, scenes?.prev, reduce, variant])

	const [traveling, setTraveling] = useState(false)
	// the Yunnan contours under a journey or a blend, fetched the first time one happens
	const [wantBackdrop, setWantBackdrop] = useState(false)
	if ((travel || blend) && !wantBackdrop) setWantBackdrop(true)
	const backdrop = useMapJson<FrameJson>(wantBackdrop ? frameMeta("yunnan").url : null)

	// Screen size, for framing, the scale bar and label placement.
	const [size, setSize] = useState({ w: 0, h: 0 })
	useEffect(() => {
		const read = () => setSize({ w: camera.width.get(), h: camera.height.get() })
		read()
		const offs = [camera.width.on("change", read), camera.height.on("change", read)]
		return () => offs.forEach((off) => off())
	}, [camera])
	const aspectOf = useCallback(() => {
		const w = camera.width.get()
		const h = camera.height.get()
		return w > 0 && h > 0 ? w / h : 1.75
	}, [camera])

	// Aim the camera when the scene changes; keep it framed when the box resizes.
	const curRef = useRef<Scene | null>(null)
	useLayoutEffect(() => {
		if (!cur) return
		curRef.current = cur
		const box = sceneBox(cur, variant, aspectOf())
		if (travel) {
			setTraveling(true)
			camera.fly(box).then(() => setTraveling(false))
		} else {
			camera.set(box)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cur?.key])
	useEffect(() => {
		let raf = 0
		const refit = () => {
			cancelAnimationFrame(raf)
			raf = requestAnimationFrame(() => {
				const scene = curRef.current
				if (scene && !camera.cx.isAnimating()) camera.set(sceneBox(scene, variant, aspectOf()))
			})
		}
		refit()
		const offs = [camera.width.on("change", refit), camera.height.on("change", refit)]
		return () => {
			cancelAnimationFrame(raf)
			offs.forEach((off) => off())
		}
	}, [camera, variant, aspectOf])

	// Elevation label on the highlighted contour, placed once the line has drawn.
	const draw = DRAW[variant]
	const bandsN = cur?.insets[0]?.bands.length ?? 0
	const drawDelay = travel ? 380 : 60
	const highlightElev = useMemo(() => {
		if (!cur || blend || cur.elevation == null) return null
		const inset = cur.insets[0]
		let best: number | null = null
		for (const e of inset.elevations)
			if (best == null || Math.abs(e - cur.elevation) < Math.abs(best - cur.elevation)) best = e
		return best != null && Math.abs(best - cur.elevation) <= inset.interval ? best : null
	}, [cur, blend])
	const [label, setLabel] = useState<{ key: string; x: number; y: number } | null>(null)
	useEffect(() => {
		if (!cur || highlightElev == null || variant === "peek") return
		const t = window.setTimeout(
			() => {
				const root = rootRef.current
				const path = svgRef.current?.querySelector<SVGPathElement>(
					`path[data-highlight="${highlightElev}"]`
				)
				const at = path && root ? nearestScreenPoint(path, root) : null
				if (at) setLabel({ key: cur.key, ...at })
			},
			reduce ? 50 : drawDelay + draw.total(bandsN) + 420
		)
		return () => window.clearTimeout(t)
	}, [cur, highlightElev, variant, reduce, drawDelay, draw, bandsN, size])

	// Parallax: index contours lean ±2 px away from the pointer.
	const onPointerMove = useCallback(
		(e: PointerEvent<HTMLElement>) => {
			if (reduce || e.pointerType !== "mouse") return
			const r = e.currentTarget.getBoundingClientRect()
			const nx = (e.clientX - r.left) / r.width - 0.5
			const ny = (e.clientY - r.top) / r.height - 0.5
			e.currentTarget.style.setProperty("--px", `${(-nx * 4).toFixed(2)}`)
			e.currentTarget.style.setProperty("--py", `${(-ny * 4).toFixed(2)}`)
		},
		[reduce]
	)
	const onPointerLeave = useCallback((e: PointerEvent<HTMLElement>) => {
		e.currentTarget.style.setProperty("--px", "0")
		e.currentTarget.style.setProperty("--py", "0")
	}, [])

	const primary = cur?.origins[0] ?? null
	const onClick = useCallback(
		(e: MouseEvent<HTMLElement>) => {
			if (!href || !primary || e.defaultPrevented || !isPlainClick(e)) return
			const ok = navigateWithMorph(router, href, labelRef.current, "origin", primary.slug, [
				{
					el: rootRef.current,
					name: originMapTransitionName(primary.slug),
					className: ORIGIN_MAP_CLASS,
				},
			])
			if (ok) e.preventDefault()
		},
		[href, primary, router]
	)

	if (!urls.length) return null

	const inset = cur?.insets[0] ?? null
	const [lon, lat] = inset ? insetLonLat(inset) : [0, 0]
	const radiusKm = inset ? Math.round((inset.origin.radius / inset.unitsPerKm) * 10) / 10 : 0
	const pxPerKm =
		cur && size.w && size.h
			? (size.w / sceneBox(cur, variant, size.w / size.h)[2]) * UNITS_PER_KM
			: 0
	const km = pxPerKm ? niceKm(pxPerKm, variant === "hero" ? 72 : 48) : 0
	const chrome = variant !== "peek"

	const heroStyle = heroSlug
		? ({
				viewTransitionName: originMapTransitionName(heroSlug),
				viewTransitionClass: ORIGIN_MAP_CLASS,
		  } as CSSProperties)
		: undefined

	const body = (
		<div
			ref={rootRef}
			className={cn(
				"relative overflow-hidden isolate bg-[#121012]",
				href && "cursor-pointer",
				className
			)}
			style={heroStyle}
			onPointerMove={onPointerMove}
			onPointerLeave={onPointerLeave}
			data-recording-key={recordingKey}
			data-origin-map={primary?.slug}
		>
			<svg
				ref={svgRef}
				className="absolute inset-0 block w-full h-full"
				preserveAspectRatio="xMidYMid slice"
				aria-hidden
			>
				{backdrop && (
					<g
						className="transition-opacity duration-500"
						style={{ opacity: traveling || blend ? 1 : 0 }}
					>
						<ContourLines bands={backdrop.bands} alpha={0.55} />
						<ContextLines context={backdrop.context} alpha={0.7} />
					</g>
				)}
				<AnimatePresence initial={false}>
					{cur && (
						<motion.g
							key={cur.key}
							initial={{ opacity: 1 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0, transition: { duration: travel ? 0.5 : 0.22, ease: EASE } }}
						>
							<SceneLayer
								scene={cur}
								variant={variant}
								reduce={reduce}
								drawDelay={drawDelay}
								highlightElev={highlightElev}
							/>
						</motion.g>
					)}
				</AnimatePresence>
			</svg>

			{chrome && cur && (
				<>
					{label && label.key === cur.key && highlightElev != null && cur.elevation != null && (
						<span
							key={label.key}
							className="absolute z-10 pointer-events-none"
							style={{ left: label.x, top: label.y, color: ringInk(cur.accent) }}
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

					{variant === "panel" && primary && (
						<span
							className="absolute left-2.5 top-2 max-w-[70%] truncate map-label text-[9.5px] leading-none text-white/45"
							title={blend ? cur.origins.map((o) => o.title).join(" · ") : undefined}
						>
							{"// "}
							<span ref={labelRef}>{[primary.hanzi, primary.title].filter(Boolean).join(" ")}</span>
							{blend && <span className="text-white/30"> +{cur.origins.length - 1}</span>}
						</span>
					)}
					{variant === "panel" && inset && (
						<span className="absolute right-2.5 top-2 text-[9px] leading-none text-white/25 tabular-nums">
							{blend ? "blend" : `${inset.interval} m`}
						</span>
					)}

					<div className="absolute inset-x-2.5 bottom-2 flex items-end justify-between gap-2 pointer-events-none text-[9px] leading-none text-white/40">
						{km > 0 ? <ScaleBar km={km} px={km * pxPerKm} /> : <span />}
						{variant === "panel" && inset && !blend && (
							<span className="tabular-nums text-white/35 truncate">
								{fmtLat(lat)} {fmtLon(lon)}
								{radiusKm >= 1 ? ` ±${radiusKm} km` : ""}
							</span>
						)}
					</div>
				</>
			)}
			{children}
		</div>
	)

	return href ? (
		<Link
			href={href}
			onClick={onClick}
			prefetch={false}
			aria-label={primary ? `Open ${primary.title} on the origin map` : "Open the origin"}
			className="block rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
		>
			{body}
		</Link>
	) : (
		body
	)
}

/**
 * What the camera frames for a scene: a blend's points with air around them; a single inset's
 * square covering the viewport (a wide panel crops it top and bottom, a tall one at the sides).
 */
function sceneBox(scene: Scene, variant: InsetVariant, aspect: number): Box {
	if (scene.insets.length > 1) {
		const pts = scene.insets.map((i) => i.shared.point)
		const span = Math.max(...scene.insets.map((i) => i.shared.viewBox[2])) * 0.35
		const [x, y, w, h] = boundsOf(pts, span * 0.5, span)
		return [x - w * 0.1, y - h * 0.1, w * 1.2, h * 1.2]
	}
	const inset = scene.insets[0]
	const [cx, cy] = inset.shared.point
	const zoom = variant === "peek" ? 0.92 : variant === "hero" ? 1 : 0.96
	const side = Math.min(inset.shared.viewBox[2], inset.shared.viewBox[3]) * zoom
	return aspect >= 1
		? [cx - side / 2, cy - side / (2 * aspect), side, side / aspect]
		: [cx - (side * aspect) / 2, cy - side / 2, side * aspect, side]
}

/** One scene: the inset placed in shared space, its marker and rings (or a blend's points). */
function SceneLayer({
	scene,
	variant,
	reduce,
	drawDelay,
	highlightElev,
}: {
	scene: Scene
	variant: InsetVariant
	reduce: boolean
	drawDelay: number
	highlightElev: number | null
}) {
	const draw = DRAW[variant]
	const ring = RING[variant](scene.rings.length)

	if (scene.insets.length > 1) {
		const pts = scene.insets.map((i) => i.shared.point)
		const hull = convexHull(pts)
		const d = hull.length ? `M${hull.map((p) => p.join(" ")).join("L")}Z` : ""
		const color = ringInk(scene.rings[0] ?? scene.accent)
		return (
			<g>
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
				{scene.insets.map((i, n) => (
					<PxGroup key={i.id} x={i.shared.point[0]} y={i.shared.point[1]}>
						<CenterDot precision={i.origin.precision} />
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

	const inset = scene.insets[0]
	const k = inset.shared.viewBox[2] / inset.viewBox[2]
	const [sx, sy] = inset.shared.point
	const gardens = scene.gardens
	const lit = ringInk(scene.accent)
	const highlight = (elev: number) =>
		elev === highlightElev
			? { color: lit, width: 1.35 }
			: gardens && elev >= gardens[0] && elev <= gardens[1]
			? { color: lit, width: 0.8, opacity: highlightElev == null ? 0.55 : 0.3 }
			: null
	const timing = {
		key: scene.key,
		delay: drawDelay,
		total: draw.total(inset.bands.length),
		duration: draw.duration,
		reduce,
	}
	return (
		<g>
			<g
				transform={`translate(${sx} ${sy}) scale(${k})`}
				style={
					{
						"--kinv": `${1 / k}`,
						"--tanaka": `calc(var(--upp, 1) * ${0.6 / k})`,
					} as CSSProperties
				}
			>
				{variant === "hero" ? (
					<>
						<rect
							x={inset.viewBox[0]}
							y={inset.viewBox[1]}
							width={inset.viewBox[2]}
							height={inset.viewBox[3]}
							fill={GROUND}
						/>
						<TanakaBands bands={inset.bands} draw={timing} highlight={highlight} />
					</>
				) : (
					<ContourLines
						bands={inset.bands}
						draw={timing}
						highlight={highlight}
						indexClassName="map-parallax"
					/>
				)}
				<ContextLines context={inset.context} />
			</g>
			<AreaMark
				x={sx}
				y={sy}
				r={inset.origin.radius * k}
				precision={inset.origin.precision}
				alpha={variant === "peek" ? 0.8 : 1}
			/>
			<PxGroup x={sx} y={sy}>
				<CenterDot precision={inset.origin.precision} />
				<Rings
					colors={scene.rings}
					base={ring.base}
					step={ring.step}
					delay={(drawDelay + draw.total(inset.bands.length) * 0.6) / 1000}
					reduce={reduce}
					drawKey={scene.key}
				/>
			</PxGroup>
		</g>
	)
}

/** A cartographer's bar: |—— 5 km */
function ScaleBar({ km, px }: { km: number; px: number }) {
	return (
		<span className="flex items-center gap-1.5">
			<svg width={Math.round(px) + 2} height={7} aria-hidden className="overflow-visible">
				<path
					d={`M1 1V6H${Math.round(px) + 1}V1`}
					fill="none"
					stroke={CREAM}
					strokeOpacity={0.45}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={`M${Math.round(px / 2) + 1} 3.5V6`}
					stroke={CREAM}
					strokeOpacity={0.3}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<span className="tabular-nums whitespace-nowrap">
				{km < 1 ? `${km * 1000} m` : `${km} km`}
			</span>
		</span>
	)
}

/** The point on a path nearest its local origin (the inset's point), in px within `root`. */
function nearestScreenPoint(
	path: SVGPathElement,
	root: HTMLElement
): { x: number; y: number } | null {
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
	// the point itself (local 0, 0) carries the marker and rings: keep the label off them
	const ox = ctm.e - box.left
	const oy = ctm.f - box.top
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
	return best ? { x: best.x, y: best.y } : null
}
