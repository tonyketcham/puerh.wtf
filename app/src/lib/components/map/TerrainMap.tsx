"use client"

/**
 * One interactive terrain map for every place the origins are drawn (plan §4.7.6): the session
 * Properties inset, the origin page's hero, the peek card, /origins, and the full-screen view
 * any of the embedded ones expands into.
 *
 * It owns the camera (camera.ts) and the gestures (gestures.ts), and draws, back to front:
 *   terrain   the LOD sheets and detail cells, each layer on its own ground with an organic edge,
 *             on a canvas (TerrainLayers, terrainCanvas.ts); the cells around the map's own origin
 *             in SVG over it while they draw on
 *   graticule degree lines at a step that suits the zoom
 *   marks     whatever the caller puts in shared space (rings, areas, hulls, arcs)
 *   labels    atlas type, placed in screen space with collision (MapLabels)
 *   furniture edge degrees, a live scale bar, the cursor's coordinate, a corner locator
 *   controls  + / − / back to the origin / expand
 *
 * Zoom changes the emphasis, not just the scale: zoomed out the contours recede under a veil of
 * land while borders, coast, rivers and labels strengthen; up close the contours come forward
 * and their index lines carry elevations. All of it rides custom properties the camera writes,
 * so moving the map re-renders nothing.
 *
 * Embedded maps leave the page's scrolling alone: a plain wheel or a one-finger swipe scrolls
 * past and a hint says how to move the map instead (⌘/Ctrl + scroll, two fingers). Expand opens
 * the same view full screen, its edges growing out of the panel; Esc hands the view back.
 */
import "./map.css"
import {
	startTransition,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type MutableRefObject,
	type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, animate, motion, useReducedMotion, type MotionValue } from "motion/react"
import { LocateFixed, Maximize2, Minus, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { MapCamera, setSvgView, useCamera, type Camera } from "./camera"
import { ContourFadeContext } from "./contourFade"
import { EASE, SHARED, type Box, type MapLabel, type Point } from "./geo"
import { useMapGestures, type GestureMode, type MapHint } from "./gestures"
import {
	GraticuleTicks,
	Minimap,
	Readout,
	ScaleBar,
} from "./MapFurniture"
import MapLabels, { type Obstacle, type Rect } from "./MapLabels"
import { MarksDrawn } from "./Marks"
import {
	emphasis,
	FINE_UPP,
	FocusLayer,
	prefetchLayersFor,
	TerrainCanvas,
	terrainSeed,
	type TerrainFocus,
	type TerrainInk,
	type TerrainSeed,
} from "./TerrainLayers"

/**
 * - panel:   Properties › Provenance, compact; chrome shows on hover / focus / first touch
 * - hero:    the origin page's map
 * - page:    /origins (the caller brings its own chrome and keys)
 * - peek:    the peek card's strip: a preview, no gestures, no chrome
 * - overlay: the full-screen map an embedded one expands into
 */
export type TerrainMapVariant = "panel" | "hero" | "page" | "peek" | "overlay"

export type TerrainController = {
	rootRef: MutableRefObject<HTMLDivElement | null>
	svgRef: MutableRefObject<SVGSVGElement | null>
	camera: Camera
	/** the reader has moved the camera since it was last framed */
	touched: MutableRefObject<boolean>
}

export function useTerrainMap(): TerrainController {
	const rootRef = useRef<HTMLDivElement | null>(null)
	const svgRef = useRef<SVGSVGElement | null>(null)
	const touched = useRef(false)
	const camera = useCamera(rootRef, svgRef)
	return useMemo(() => ({ rootRef, svgRef, camera, touched }), [camera])
}

export type TerrainMapProps = {
	variant: TerrainMapVariant
	/** bring your own camera (to drive it from outside); otherwise the map makes one */
	controller?: TerrainController
	/** what the map frames at first, on resize until touched, and on reset */
	home?: Box | null
	/** frame `home` on mount (the overlay positions its own camera instead) */
	frameOnMount?: boolean
	ink?: TerrainInk
	focus?: TerrainFocus | null
	contours?: boolean
	rivers?: boolean
	/** atlas labels to leave out (an origin the map labels itself) */
	skipLabel?: (l: MapLabel) => boolean
	/** marks the labels keep clear of */
	obstacles?: Obstacle[]
	/** terrain + marks opacity (the /origins ridge hero dims the plan view) */
	dim?: MotionValue<number>
	/** labels and furniture opacity */
	fade?: MotionValue<number>
	/** marks in shared space, over the terrain */
	marks?: ReactNode
	/** shared space, above everything else in the <svg> (the ridge hero) */
	top?: ReactNode
	/** HTML over the map (rings, tags), placed with the camera's CSS variables */
	children?: ReactNode
	/** top-left line (the labels and degree ticks keep clear of it) */
	caption?: ReactNode
	/** bottom-right, after the readout */
	footer?: ReactNode
	/** what the readout says while the pointer is elsewhere */
	readout?: string | null
	/** + / − / reset (and expand) buttons */
	controls?: boolean
	expandable?: boolean
	/** arrows, + / −, 0 while the map has focus */
	keyboard?: boolean
	onUserMove?: () => void
	/** overlay only */
	onClose?: () => void
	/** overlay only: the picture of the map it grows out of (shown until this one's first render) */
	seed?: TerrainSeed | null
	/**
	 * overlay only: the terrain and marks alone for now. The full-screen view mounts in two
	 * commits, its labels, furniture and controls a frame after its terrain: in one, the commit and
	 * the effects after it were a 10 ms frame each
	 */
	bare?: boolean
	label?: string
	className?: string
	style?: CSSProperties
	recordingKey?: string
	dataAttrs?: Record<string, string | undefined>
}

export default function TerrainMap(props: TerrainMapProps) {
	return props.controller ? (
		<TerrainMapView {...props} controller={props.controller} />
	) : (
		<OwnCamera {...props} />
	)
}

function OwnCamera(props: TerrainMapProps) {
	const controller = useTerrainMap()
	return <TerrainMapView {...props} controller={controller} />
}

const IS_MAC =
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function TerrainMapView({
	variant,
	controller,
	home = null,
	frameOnMount = true,
	ink = variant === "panel" || variant === "peek" ? "hairline" : "tanaka",
	focus = null,
	contours = true,
	rivers = true,
	skipLabel,
	obstacles,
	dim,
	fade,
	marks,
	top,
	children,
	caption,
	footer,
	readout,
	controls = variant !== "peek" && variant !== "page",
	expandable = variant === "panel" || variant === "hero",
	keyboard = variant !== "peek",
	onUserMove,
	onClose,
	seed,
	bare = false,
	label = "Terrain map",
	className,
	style,
	recordingKey,
	dataAttrs,
}: TerrainMapProps & { controller: TerrainController }) {
	const { rootRef, svgRef, camera, touched } = controller
	const reduce = useReducedMotion() ?? false
	const mode: GestureMode =
		variant === "peek"
			? "none"
			: variant === "page"
			? "page"
			: variant === "overlay"
			? "overlay"
			: "embedded"
	const interactive = mode !== "none"
	const compact = variant === "panel"

	// -------------------------------------------------------------------------- touch state
	const [engaged, setEngaged] = useState(variant === "overlay")
	const moved = useCallback(() => {
		touched.current = true
		setEngaged(true)
		onUserMove?.()
	}, [touched, onUserMove])

	const [hint, setHint] = useState<MapHint | null>(null)
	const hintTimer = useRef(0)
	const onHint = useCallback((h: MapHint) => {
		setHint(h)
		window.clearTimeout(hintTimer.current)
		hintTimer.current = window.setTimeout(() => setHint(null), 1500)
	}, [])
	useEffect(() => () => window.clearTimeout(hintTimer.current), [])

	useMapGestures(rootRef, camera, { mode, reduce, onMove: moved, onHint })

	// -------------------------------------------------------------------------- framing
	const homeRef = useRef(home)
	useLayoutEffect(() => {
		homeRef.current = home
	})
	useLayoutEffect(() => {
		if (frameOnMount && homeRef.current) camera.set(homeRef.current)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	// keep `home` framed while the box resizes, until the reader takes over
	useEffect(() => {
		let raf = 0
		const refit = () => {
			cancelAnimationFrame(raf)
			raf = requestAnimationFrame(() => {
				const box = homeRef.current
				if (box && !touched.current && !camera.cx.isAnimating() && !camera.lw.isAnimating())
					camera.set(box)
			})
		}
		const offs = [camera.width.on("change", refit), camera.height.on("change", refit)]
		return () => {
			cancelAnimationFrame(raf)
			offs.forEach((off) => off())
		}
	}, [camera, touched])

	const reset = useCallback(() => {
		const box = homeRef.current
		if (!box) return
		touched.current = false
		onUserMove?.()
		void camera.fly(box, { reduce })
	}, [camera, reduce, touched, onUserMove])

	const zoom = useCallback(
		(f: number) => {
			moved()
			camera.zoomAt(f, undefined, { animate: true, reduce })
		},
		[camera, moved, reduce]
	)

	// -------------------------------------------------------------------------- emphasis
	// the terrain's share changes with each render of the svg (not every frame: see camera.ts);
	// the labels' share, on the HTML overlay, every frame
	useEffect(() => {
		let last = ""
		let fine: boolean | null = null
		return camera.subscribeBase(({ upp }) => {
			const svg = svgRef.current
			if (!svg) return
			const t = emphasis(upp)
			const key = t.toFixed(3)
			if (key !== last) {
				last = key
				setSvgView(svg, "contourA", 1 - 0.62 * t)
				setSvgView(svg, "refA", 0.85 + 0.8 * t)
			}
			const f = upp <= FINE_UPP
			if (f !== fine) {
				fine = f
				if (f) svg.dataset.mapFine = ""
				else delete svg.dataset.mapFine
			}
		})
	}, [camera, svgRef])
	useEffect(() => {
		let last = ""
		return camera.subscribe(({ upp }) => {
			const a = (0.86 + 0.14 * emphasis(upp)).toFixed(3)
			if (a === last || !overlayRef.current) return
			last = a
			overlayRef.current.style.setProperty("--label-a", a)
		})
	}, [camera])

	// -------------------------------------------------------------------------- chrome rects
	// Measured when the map or a piece of its chrome changes size: a ResizeObserver runs right
	// after layout, so reading rects there costs nothing. Measured on every pass, as the degree
	// ticks and labels re-place themselves while the camera moves, each read forced a style and
	// layout pass mid-frame (one of them, closing the full-screen map, a 9 ms whole-page layout).
	const chrome = useRef<Rect[] | null>(null)
	const measureChrome = useCallback((): Rect[] => {
		const root = rootRef.current
		if (!root) return []
		const rb = root.getBoundingClientRect()
		const rects = Array.from(root.querySelectorAll<HTMLElement>("[data-map-reserve]")).map(
			(el): Rect => {
				const r = el.getBoundingClientRect()
				return [
					r.left - rb.left - 3,
					r.top - rb.top - 3,
					r.right - rb.left + 3,
					r.bottom - rb.top + 3,
				]
			}
		)
		chrome.current = rects
		return rects
	}, [rootRef])
	useEffect(() => {
		const root = rootRef.current
		if (!root || typeof ResizeObserver === "undefined") return
		const ro = new ResizeObserver(() => measureChrome())
		ro.observe(root)
		root.querySelectorAll("[data-map-reserve]").forEach((el) => ro.observe(el))
		return () => ro.disconnect()
	})
	const reserved = useCallback(
		(): Rect[] => chrome.current ?? measureChrome(),
		[measureChrome]
	)
	// the chrome came in after the map (the full-screen view's second commit): measured afresh
	useLayoutEffect(() => {
		if (!bare) chrome.current = null
	}, [bare])
	// the labels also keep clear of the degree ticks that are showing (placed from the camera, as
	// GraticuleTicks places them: 8.5 px Fira Code, 0.6 em a character)
	const reservedForLabels = useCallback((): Rect[] => {
		const root = rootRef.current
		if (!root) return []
		const t = camera.tick()
		const [vx, vy] = t.view
		const ticks = Array.from(root.querySelectorAll<HTMLElement>(".map-tick"))
			.filter((el) => el.style.visibility !== "hidden")
			.map((el): Rect => {
				const v = Number(el.dataset.v)
				const w = (el.textContent?.length ?? 0) * 5.1
				if (el.dataset.axis === "lon") {
					const x = (SHARED.forward(v, 25)[0] - vx) / t.upp + 3
					return [x - 2, 2, x + w + 2, 14.5]
				}
				const y = (SHARED.forward(102, v)[1] - vy) / t.upp - 2
				return [2, y - 10.5, 4 + w + 2, y + 2]
			})
		return [...reserved(), ...ticks]
	}, [rootRef, reserved, camera])

	const focusRef = useRef<SVGGElement | null>(null)
	// the focus cells draw on in SVG; once they have, the canvas takes them over (a large SVG
	// rasterizes in tiles, slowly, as a pan reveals them)
	const draw = focus?.draw
	const drawEnd = draw ? (draw.delay ?? 0) + (draw.total ?? 400) + (draw.duration ?? 400) + 700 : 0
	const [settledKey, setSettledKey] = useState<unknown>(undefined)
	const focusSettled = !draw || draw.play === false || settledKey === draw.key
	useEffect(() => {
		if (!draw) return
		const key = draw.key
		const t = window.setTimeout(() => setSettledKey(key), reduce ? 300 : drawEnd)
		return () => window.clearTimeout(t)
	}, [draw, drawEnd, reduce])
	const overlayRef = useRef<HTMLDivElement>(null)

	// -------------------------------------------------------------------------- keyboard
	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!keyboard || !interactive || e.metaKey || e.ctrlKey || e.altKey) return
		if (e.target !== e.currentTarget) return
		const [vx, vy, vw, vh] = camera.view()
		const pan = (dx: number, dy: number) => {
			e.preventDefault()
			moved()
			void camera.fly([vx + dx * vw, vy + dy * vh, vw, vh], { reduce })
		}
		switch (e.key) {
			case "ArrowLeft":
				return pan(-0.25, 0)
			case "ArrowRight":
				return pan(0.25, 0)
			case "ArrowUp":
				return pan(0, -0.25)
			case "ArrowDown":
				return pan(0, 0.25)
			case "+":
			case "=":
				e.preventDefault()
				return zoom(0.5)
			case "-":
			case "_":
				e.preventDefault()
				return zoom(2)
			case "0":
				e.preventDefault()
				return reset()
		}
	}

	// -------------------------------------------------------------------------- expand
	/** open: the picture the full-screen view grows out of (null: none to show) */
	const [expanded, setExpanded] = useState<{ seed: TerrainSeed | null } | null>(null)
	const expandRef = useRef<HTMLButtonElement>(null)
	const opening = useRef(false)
	const expand = () => {
		if (opening.current) return
		opening.current = true
		// what this map shows, snapshotted first, then the full-screen map (a large render: let
		// React slice it)
		void terrainSeed(rootRef.current).then((s) => {
			opening.current = false
			startTransition(() => setExpanded({ seed: s }))
		})
	}
	const [minimapOn, setMinimapOn] = useState(variant === "overlay" || variant === "hero")
	useEffect(() => {
		if (engaged) setMinimapOn(true)
	}, [engaged])
	// no hover on a touch screen: the panel's chrome (and its locator) shows from the start (the
	// others show it anyway; a media query is half a millisecond in the full-screen view's mount)
	useEffect(() => {
		if (variant !== "overlay" && variant !== "hero" && window.matchMedia?.("(hover: none)").matches)
			setMinimapOn(true)
	}, [variant])

	const prefetched = useRef(false)
	const onPointerEnter = () => {
		if (!interactive) return
		if (variant !== "page") setMinimapOn(true)
		if (prefetched.current) return
		prefetched.current = true
		prefetchLayersFor(camera.view())
	}

	const furniture = variant !== "peek"
	const showMinimap = variant === "panel" || variant === "hero" || variant === "overlay"
	// panel chrome waits for the reader (the panel looks as it did until touched; map.css)
	const reveal = compact ? "map-reveal" : ""

	const hintText =
		hint === "wheel"
			? `${IS_MAC ? "⌘" : "Ctrl"} + scroll to zoom`
			: hint === "touch"
			? "Use two fingers to move the map"
			: null

	return (
		<div
			ref={rootRef}
			tabIndex={interactive && keyboard ? 0 : undefined}
			role={interactive ? "region" : undefined}
			aria-roledescription={interactive ? "map" : undefined}
			aria-label={
				interactive
					? `${label}. Drag to pan, ${
							IS_MAC ? "⌘" : "Ctrl"
					  } + scroll or pinch to zoom; arrows pan, + and − zoom, 0 resets.`
					: undefined
			}
			className={cn(
				"group/map relative overflow-hidden isolate select-none bg-[#0b0b0e] outline-none",
				interactive && "cursor-grab data-[map-dragging]:cursor-grabbing",
				interactive && "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/40",
				className
			)}
			style={{
				touchAction: mode === "overlay" ? "none" : mode === "none" ? "auto" : "pan-x pan-y",
				...style,
			}}
			data-recording-key={recordingKey}
			data-map-variant={variant}
			data-map-engaged={engaged ? "" : undefined}
			onKeyDown={onKeyDown}
			onPointerEnter={onPointerEnter}
			{...dataAttrs}
		>
			{/* sized and moved by the camera: it renders past the view (see camera.ts) */}
			<div data-map-pane="" className="absolute left-0 top-0">
				<TerrainCanvas
					camera={camera}
					ink={ink}
					contours={contours}
					rivers={rivers}
					focus={focus}
					focusSettled={focusSettled}
					focusRef={focusRef}
					eager={engaged || (variant !== "panel" && variant !== "peek")}
					dim={dim}
					seed={seed}
					graticule={furniture}
				/>
				<svg
					ref={svgRef}
					className="absolute inset-0 block w-full h-full"
					preserveAspectRatio="xMidYMid slice"
					aria-hidden
				>
					<motion.g style={dim ? { opacity: dim } : undefined}>
						{/* only while it draws on: settled, the canvas has the cells, and the copy leaves the
						    DOM (hidden, its ~3,800 elements were still laid out on every rescale of the svg) */}
						{focus && !focusSettled && (
							<FocusLayer
								focus={focus}
								ink={ink}
								contours={contours}
								rivers={rivers}
								gRef={focusRef}
								camera={camera}
							/>
						)}
							{marks}
					</motion.g>
					{top}
				</svg>
			</div>

			{/* everything pinned to the camera (camera.ts: usePin, and the movers that carry the pins
			    through a pan) */}
			<div ref={overlayRef} data-map-overlay="" className="absolute inset-0 pointer-events-none">
				{!bare && (
					<MapCamera.Provider value={camera}>
						<MapLabels
							camera={camera}
							skip={skipLabel}
							obstacles={obstacles}
							reserved={reservedForLabels}
							fade={fade}
						/>
						{furniture && (
							<motion.div
								className="absolute inset-0 pointer-events-none"
								style={fade ? { opacity: fade } : undefined}
							>
								<GraticuleTicks camera={camera} reserved={reserved} />
							</motion.div>
						)}
						{children}
					</MapCamera.Provider>
				)}
			</div>

			{caption && !bare && (
				<div data-map-reserve="" className="absolute left-2.5 top-2 max-w-[62%] z-10">
					{caption}
				</div>
			)}

			{furniture && !bare && (
				<motion.div
					className={cn(
						"absolute inset-x-2.5 bottom-2 flex items-end justify-between gap-3 pointer-events-none text-[9px] leading-none text-white/40",
						variant === "overlay" && "inset-x-4 bottom-3 text-[10px]"
					)}
					style={fade ? { opacity: fade } : undefined}
				>
					<span data-map-reserve="" className="flex items-center min-w-0 gap-3">
						<ScaleBar camera={camera} target={compact ? 44 : 72} />
						{!compact && (
							<Readout camera={camera} rootRef={rootRef} rest={readout} className="text-white/35" />
						)}
					</span>
					<span data-map-reserve="" className="flex items-end min-w-0 gap-3">
						{compact && (
							<Readout camera={camera} rootRef={rootRef} rest={readout} className="text-white/35" />
						)}
						{footer}
						{showMinimap && !compact && (
							<Minimap
								camera={camera}
								active={minimapOn}
								width={variant === "overlay" ? 132 : 84}
								reduce={reduce}
								onJump={moved}
								className="pointer-events-auto"
							/>
						)}
					</span>
				</motion.div>
			)}

			{controls && interactive && !bare && (
				<div
					data-map-ui=""
					data-map-reserve=""
					className={cn(
						"absolute flex gap-1 right-2 top-2 z-10",
						variant === "overlay" && "right-3 top-3",
						reveal
					)}
				>
					<MapButton label="Zoom in (+)" onClick={() => zoom(0.5)} small={compact}>
						<Plus size={compact ? 11 : 12} strokeWidth={2} />
					</MapButton>
					<MapButton label="Zoom out (−)" onClick={() => zoom(2)} small={compact}>
						<Minus size={compact ? 11 : 12} strokeWidth={2} />
					</MapButton>
					{home && (
						<MapButton label="Back to the origin (0)" onClick={reset} small={compact}>
							<LocateFixed size={compact ? 11 : 12} strokeWidth={2} />
						</MapButton>
					)}
					{expandable && (
						<MapButton
							ref={expandRef}
							label="Expand the map"
							onClick={expand}
							small={compact}
						>
							<Maximize2 size={compact ? 10 : 11} strokeWidth={2} />
						</MapButton>
					)}
					{onClose && (
						<MapButton label="Close (Esc)" onClick={onClose} small={false}>
							<X size={13} strokeWidth={2} />
						</MapButton>
					)}
				</div>
			)}

			{/* the panel's minimap sits under its controls */}
			{compact && showMinimap && controls && interactive && (
				<div data-map-reserve="" className={cn("absolute right-2 top-8 z-10", reveal)}>
					<Minimap
						camera={camera}
						active={minimapOn}
						width={58}
						reduce={reduce}
						onJump={moved}
						fade={fade}
					/>
				</div>
			)}

			<AnimatePresence>
				{hintText && (
					<motion.div
						key={hint}
						aria-live="polite"
						className="absolute inset-0 z-20 grid pointer-events-none place-items-center bg-[#0b0b0e]/45"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18 }}
					>
						<span className="px-2.5 py-1.5 rounded-[4px] bg-[#121012]/95 ring-1 ring-inset ring-white/15 text-[11px] leading-none text-white/80 whitespace-nowrap">
							{hintText}
						</span>
					</motion.div>
				)}
			</AnimatePresence>

			{expanded && (
				<ExpandedMap
					source={controller}
					seed={expanded.seed}
					props={{
						variant: "overlay",
						home,
						// full screen has the room for the relief (the panel draws hairlines)
						ink: "tanaka",
						// the lines are already drawn: no draw-on again (and no SVG copy of the cells)
						focus: focus ? { ...focus, draw: undefined, cells: [] } : null,
						contours,
						rivers,
						skipLabel,
						obstacles,
						marks,
						children,
						caption,
						readout,
						label,
					}}
					onClosed={() => {
						setExpanded(null)
						setEngaged(true)
						expandRef.current?.focus({ preventScroll: true })
					}}
				/>
			)}
		</div>
	)
}

function MapButton({
	label,
	onClick,
	children,
	small,
	ref,
}: {
	label: string
	onClick: () => void
	children: ReactNode
	small: boolean
	ref?: React.Ref<HTMLButtonElement>
}) {
	return (
		<button
			ref={ref}
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={cn(
				"grid place-items-center rounded-[4px] bg-[#121012]/90 ring-1 ring-inset ring-white/[0.12] text-white/60 outline-none transition-colors hover:text-white hover:ring-white/35 focus-visible:ring-white/70",
				small ? "size-[18px]" : "size-6"
			)}
		>
			{children}
		</button>
	)
}

// ---------------------------------------------------------------------------------------------
// Full-screen
// ---------------------------------------------------------------------------------------------

const viewAt = ([cx, cy]: Point, upp: number, W: number, H: number): Box => [
	cx - (W * upp) / 2,
	cy - (H * upp) / 2,
	W * upp,
	H * upp,
]

const insetOf = (r: DOMRect, W: number, H: number, radius = 6) =>
	`inset(${r.top}px ${W - r.right}px ${H - r.bottom}px ${r.left}px round ${radius}px)`

// a box of the page sits out (content-visibility: hidden) at the size it was laid out at, so
// nothing around it moves and the scroll position survives
const sitOut = (el: HTMLElement, r: DOMRect) => {
	el.style.containIntrinsicSize = `${r.width}px ${r.height}px`
	el.style.contentVisibility = "hidden"
}
const sitIn = (el: HTMLElement) => {
	el.style.contentVisibility = ""
	el.style.containIntrinsicSize = ""
}
// the boxes out of view come back a box a frame, once the frames that close the map have passed
const sitInLater = (list: HTMLElement[]) => {
	let wait = 2
	const next = () => {
		if (wait > 0) wait--
		else {
			const el = list.shift()
			if (!el) return
			sitIn(el)
		}
		requestAnimationFrame(next)
	}
	requestAnimationFrame(next)
}

/**
 * The same map, full screen. It opens as the panel's own edges growing to the viewport (a clip
 * that starts on the panel's rect, over a camera placed so the panel's view sits exactly where
 * it was), then centers; closing hands the view back to the panel and shrinks onto it.
 */
function ExpandedMap({
	source,
	seed,
	props,
	onClosed,
}: {
	source: TerrainController
	seed: TerrainSeed | null
	props: TerrainMapProps
	onClosed: () => void
}) {
	const reduce = useReducedMotion() ?? false
	const ctl = useTerrainMap()
	const wrapRef = useRef<HTMLDivElement>(null)
	const closing = useRef(false)
	// the terrain mounts first, unseen (the panel still shows through); the labels, furniture and
	// controls a frame later, and with them the view shows; the grow starts two frames after that
	const [full, setFull] = useState(false)
	const grow = useRef<(() => void) | null>(null)

	// the page under the open map sits out (the body's other boxes): left rendered, every frame of
	// a pan or zoom re-layerized all of it, ~100 KB of Oilpan garbage a frame and a major GC every
	// few seconds. Hidden once the grow has covered it; shown again as the close starts, while the
	// overlay still covers it, a slice of the view a frame (all at once, its layout, paint and the
	// panel svg's deferred restyle make a 13–16 ms frame); its boxes out of view wait until the map
	// has gone
	const under = useRef<{ top: HTMLElement[]; slices: HTMLElement[][]; off: HTMLElement[] }>({
		top: [],
		slices: [],
		off: [],
	})
	const hidePage = () => {
		const wrap = wrapRef.current
		const u = under.current
		if (!wrap || closing.current || u.top.length) return
		const W = window.innerWidth
		const H = window.innerHeight
		const A = W * H
		const seen = (r: DOMRect) =>
			Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) *
			Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0))
		const top: [HTMLElement, DOMRect][] = []
		const part: [HTMLElement, DOMRect, number][] = []
		const off: [HTMLElement, DOMRect][] = []
		for (const c of document.body.children) {
			if (c === wrap || !(c instanceof HTMLElement) || c.tagName === "SCRIPT") continue
			const r = c.getBoundingClientRect()
			if (r.width && r.height) top.push([c, r])
		}
		// under them, the outermost boxes in view that show at most a quarter of it (the slices the
		// close brings back), and the outermost boxes wholly out of view
		const walk = (el: HTMLElement, depth: number, inPart: boolean) => {
			for (const k of el.children) {
				if (!(k instanceof HTMLElement)) continue
				const r = k.getBoundingClientRect()
				if (!r.width || !r.height) continue
				const a = seen(r)
				if (!a) {
					off.push([k, r])
					continue
				}
				const whole = !inPart && (a <= A / 4 || depth >= 8)
				if (whole) part.push([k, r, a])
				if (depth < 8) walk(k, depth + 1, inPart || whole)
			}
		}
		for (const [c] of top) walk(c, 0, false)
		// all the reads, then all the writes: one layout
		for (const [c, r] of top) sitOut(c, r)
		for (const [c, r] of part) sitOut(c, r)
		for (const [c, r] of off) sitOut(c, r)
		// the parts in slices of about a quarter of the view
		const slices: HTMLElement[][] = []
		let sum = A
		for (const [c, , a] of part) {
			if (sum + a > A / 4) {
				slices.push([])
				sum = 0
			}
			slices[slices.length - 1].push(c)
			sum += a
		}
		u.top = top.map(([c]) => c)
		u.slices = slices
		u.off = off.map(([c]) => c)
	}
	const showPage = () => {
		const u = under.current
		u.top.forEach(sitIn)
		u.slices.forEach((s) => s.forEach(sitIn))
		u.top = []
		u.slices = []
	}
	useEffect(() => {
		const u = under.current
		return () => {
			u.top.forEach(sitIn)
			u.slices.forEach((s) => s.forEach(sitIn))
			sitInLater(u.off)
			u.top = []
			u.slices = []
			u.off = []
		}
	}, [])

	useLayoutEffect(() => {
		const wrap = wrapRef.current
		const from = source.rootRef.current?.getBoundingClientRect()
		const t = source.camera.tick()
		const W = window.innerWidth
		const H = window.innerHeight
		const [vx, vy, vw, vh] = t.view
		const c: Point = [vx + vw / 2, vy + vh / 2]
		ctl.touched.current = true
		// the chrome next frame (its effects, and the terrain's first request, then land in frames
		// of their own)
		const raf = requestAnimationFrame(() => startTransition(() => setFull(true)))
		if (!wrap || !from) {
			ctl.camera.set(viewAt(c, t.upp, W, H))
			return () => cancelAnimationFrame(raf)
		}
		// the panel's view, exactly where the panel is
		const off: Point = [
			(W / 2 - (from.left + from.width / 2)) * t.upp,
			(H / 2 - (from.top + from.height / 2)) * t.upp,
		]
		// a quick draft first (the full relief follows once the camera rests): the morph can't wait
		ctl.camera.set(viewAt([c[0] + off[0], c[1] + off[1]], t.upp, W, H), 0, { draft: !reduce })
		ctl.rootRef.current?.focus({ preventScroll: true })
		if (reduce) {
			grow.current = hidePage
			return () => cancelAnimationFrame(raf)
		}
		wrap.style.clipPath = insetOf(from, W, H)
		// until it grows the overlay sits exactly over the panel, showing what the panel shows
		grow.current = () => {
			animate(
				wrap,
				{ clipPath: [insetOf(from, W, H), "inset(0px 0px 0px 0px round 0px)"] },
				{ duration: 0.5, ease: EASE }
			).then(hidePage)
			void ctl.camera.fly(viewAt(c, t.upp, W, H))
		}
		return () => cancelAnimationFrame(raf)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	// the view shows (the chrome's commit): grow two frames on, its first frame clear of the chrome's
	// effects and of the terrain's first request
	useLayoutEffect(() => {
		const go = grow.current
		if (!full || !go) return
		grow.current = null
		if (reduce) return go()
		let raf = requestAnimationFrame(() => {
			raf = requestAnimationFrame(() => {
				if (!closing.current) go()
			})
		})
		return () => cancelAnimationFrame(raf)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [full])

	const shrink = () => {
		const wrap = wrapRef.current
		const to = source.rootRef.current?.getBoundingClientRect()
		const t = ctl.camera.tick()
		const [vx, vy, vw, vh] = t.view
		const c: Point = [vx + vw / 2, vy + vh / 2]
		// hand the view back: the panel shows what was at the screen's center, at this scale (a
		// frame after the shrink starts, under the overlay: the panel's rebase, labels and
		// terrain request then don't land in the same frame as the overlay's first move)
		const handBack = () => {
			if (!to) return
			source.camera.stop()
			source.touched.current = true
			source.camera.cx.set(c[0])
			source.camera.cy.set(c[1])
			source.camera.lw.set(Math.log(t.upp * to.width))
		}
		if (reduce || !wrap || !to) {
			handBack()
			return onClosed()
		}
		requestAnimationFrame(() => requestAnimationFrame(handBack))
		const W = window.innerWidth
		const H = window.innerHeight
		const off: Point = [
			(W / 2 - (to.left + to.width / 2)) * t.upp,
			(H / 2 - (to.top + to.height / 2)) * t.upp,
		]
		void ctl.camera.fly(viewAt([c[0] + off[0], c[1] + off[1]], t.upp, W, H))
		animate(wrap, { clipPath: insetOf(to, W, H) }, { duration: 0.42, ease: EASE }).then(onClosed)
	}
	const close = () => {
		if (closing.current) return
		closing.current = true
		const u = under.current
		if (!u.top.length || reduce) {
			showPage()
			return shrink()
		}
		// the page comes back first, under the still-covering overlay: its boxes (their parts in view
		// still sitting out), then a slice a frame, each painted in a frame of its own; the frame
		// after the last measures it and starts the shrink
		u.top.forEach(sitIn)
		u.top = []
		const next = () => {
			if (!wrapRef.current) return
			const s = u.slices.shift()
			if (!s) return shrink()
			s.forEach(sitIn)
			requestAnimationFrame(next)
		}
		requestAnimationFrame(() => requestAnimationFrame(next))
	}
	const closeRef = useRef(close)
	useLayoutEffect(() => {
		closeRef.current = close
	})

	// the panel's own svg (marks, the drawn-on cells) sits out while it is covered: handing the
	// view back re-lays it out, a 10 ms frame at the start of the close. content-visibility, not
	// display: none, which throws away the styles of its ~3,000 elements, a 20 ms restyle when the
	// overlay unmounts; skipped, they're kept, and showing it again restyles only what the new
	// scale changed (camera.ts, setSvgView), then lays it out
	useEffect(() => {
		const svg = source.svgRef.current
		if (!svg) return
		const t = window.setTimeout(() => (svg.style.contentVisibility = "hidden"), 700)
		return () => {
			window.clearTimeout(t)
			svg.style.contentVisibility = ""
		}
	}, [source])

	// Esc closes; the page underneath doesn't scroll meanwhile
	useEffect(() => {
		const onKey = (e: globalThis.KeyboardEvent) => {
			if (e.key !== "Escape") return
			e.preventDefault()
			e.stopPropagation()
			closeRef.current()
		}
		window.addEventListener("keydown", onKey, true)
		// only when the document itself scrolls: toggling overflow on a page that scrolls an inner
		// element (the IDE frame) lays out the whole page again, a long frame on open and on close
		const html = document.documentElement
		const lock = html.scrollHeight > html.clientHeight
		const prev = html.style.overflow
		if (lock) html.style.overflow = "hidden"
		return () => {
			window.removeEventListener("keydown", onKey, true)
			if (lock) html.style.overflow = prev
		}
	}, [])

	return createPortal(
		<div
			ref={wrapRef}
			role="dialog"
			aria-modal="true"
			aria-label={props.label ?? "Map"}
			className="fixed inset-0 z-[200] bg-[#0b0b0e]"
			style={full ? undefined : { opacity: 0 }}
		>
			{/* the full-screen copy doesn't fade with the hero it came from, nor draw its rings again */}
			<ContourFadeContext.Provider value={null}>
				<MarksDrawn.Provider value={true}>
					<TerrainMap
						{...props}
						controller={ctl}
						frameOnMount={false}
						expandable={false}
						onClose={close}
						seed={seed}
						bare={!full}
						className="absolute inset-0"
					/>
				</MarksDrawn.Provider>
			</ContourFadeContext.Provider>
		</div>,
		document.body
	)
}
