"use client"

/**
 * The storage layer (plan §3.5, §4.5 step 7): where the teas aged, as a second, dimmer map
 * under the origins. Each storage place a session names (Guangzhou, Hong Kong, Kunming,
 * Taiwan, Malaysia…) is a small hollow square, a warehouse rather than a garden; a hairline
 * arc runs from where each aged tea grew to its first store, then on from store to store
 * (Hekai → Menghai → Guangzhou), heavier for more sessions. Arcs bow the other way from the
 * supply lines, so the two layers read apart when both are on, and draw on in vintage order.
 *
 * Places come from lib/storage.ts; places with no point ("somewhere", a home fridge) stay off
 * the map and only show in the session's storage timeline.
 */
import { memo, useMemo } from "react"
import { motion } from "motion/react"
import { STORAGE_PLACES, storagePlace, HUMIDITY } from "@/lib/storage"
import type { ExplorerSession, StorageHumidity } from "@/lib/types/session"
import { usePin, type PinWrite } from "./camera"
import { CREAM, EASE, projectShared, type Point } from "./geo"
import { PxGroup } from "./Marks"

export type StorageNode = {
	key: string
	title: string
	hanzi: string | null
	at: Point
	/** sessions that aged here */
	sessions: string[]
	/** the humidity most of them aged in, when the text says */
	humidity: StorageHumidity | null
}

export type StorageArc = {
	key: string
	from: Point
	to: Point
	/** origin → first store, or store → store */
	leg: "origin" | "move"
	sessions: string[]
	/** oldest vintage among them, for the draw-on order */
	year: number
}

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Nodes and arcs from every session's storage. `originAt` places a session's origins (the
 * map's markers); a session with no placed origin starts at its first store.
 */
export function useStorageLayer(
	sessions: readonly ExplorerSession[],
	originAt: (slug: string) => Point | null
): { nodes: StorageNode[]; arcs: StorageArc[] } {
	return useMemo(() => {
		const nodes = new Map<string, StorageNode & { wet: Record<string, number> }>()
		const arcs = new Map<string, StorageArc>()
		const pointOf = (key: string): Point | null => {
			const p = STORAGE_PLACES[key]
			return p && p.lon != null && p.lat != null ? projectShared(p.lon, p.lat) : null
		}
		const addArc = (from: Point, to: Point, leg: StorageArc["leg"], s: ExplorerSession) => {
			if (from[0] === to[0] && from[1] === to[1]) return
			const key = `${leg}:${r1(from[0])},${r1(from[1])}>${r1(to[0])},${r1(to[1])}`
			const arc = arcs.get(key) ?? { key, from, to, leg, sessions: [], year: Infinity }
			if (!arc.sessions.includes(s._slug)) arc.sessions.push(s._slug)
			arc.year = Math.min(arc.year, Math.trunc(Number(s.production_year)) || Infinity)
			arcs.set(key, arc)
		}

		for (const s of sessions) {
			const stops = (s.storage || [])
				.filter((st) => !!st?.place)
				.map((st) => ({ st, at: pointOf(st.place) }))
				.filter((x): x is { st: typeof x["st"]; at: Point } => !!x.at)
			if (!stops.length) continue
			for (const { st, at } of stops) {
				const place = storagePlace(st.place)
				const node = nodes.get(place.key) ?? {
					key: place.key,
					title: place.title,
					hanzi: place.hanzi ?? null,
					at,
					sessions: [],
					humidity: null,
					wet: {},
				}
				if (!node.sessions.includes(s._slug)) node.sessions.push(s._slug)
				if (st.humidity) node.wet[st.humidity] = (node.wet[st.humidity] ?? 0) + 1
				nodes.set(place.key, node)
			}
			// grew here → first store
			const origins = (s.origin || [])
				.map((o) => (o?._slug ? originAt(o._slug) : null))
				.filter((p): p is Point => !!p)
			for (const o of origins) addArc(o, stops[0].at, "origin", s)
			// store → store
			for (let i = 1; i < stops.length; i++) addArc(stops[i - 1].at, stops[i].at, "move", s)
		}

		return {
			nodes: [...nodes.values()]
				.map(({ wet, ...n }) => {
					const top = Object.entries(wet).sort((a, b) => b[1] - a[1])[0]
					return { ...n, humidity: (top?.[0] as StorageHumidity | undefined) ?? null }
				})
				.sort((a, b) => b.sessions.length - a.sessions.length || a.key.localeCompare(b.key)),
			arcs: [...arcs.values()].sort((a, b) => a.year - b.year || a.key.localeCompare(b.key)),
		}
	}, [sessions, originAt])
}

/** The arcs and the warehouse marks (SVG, shared units). */
export const StorageMarks = memo(function StorageMarks({
	nodes,
	arcs,
	passes,
	reduce,
}: {
	nodes: StorageNode[]
	arcs: StorageArc[]
	/** session → passes the Explorer filters */
	passes: Map<string, boolean>
	reduce: boolean
}) {
	const paths = useMemo(
		() =>
			arcs.map((a) => {
				const [x0, y0] = a.from
				const [x1, y1] = a.to
				const dx = x1 - x0
				const dy = y1 - y0
				// bow to the right of travel (supply lines bow left), less for longer hauls
				const k = Math.hypot(dx, dy) > 2000 ? 0.1 : 0.16
				const cx = (x0 + x1) / 2 + dy * k
				const cy = (y0 + y1) / 2 - dx * k
				return {
					...a,
					d: `M${r1(x0)} ${r1(y0)}Q${r1(cx)} ${r1(cy)} ${r1(x1)} ${r1(y1)}`,
					w: 0.6 + Math.log2(1 + a.sessions.length) * 0.4,
				}
			}),
		[arcs]
	)
	const on = (sessions: string[]) => sessions.some((s) => passes.get(s) !== false)
	return (
		<g fill="none" className="pointer-events-none" data-map-layer="storage">
			{paths.map((a, i) => (
				<motion.path
					key={a.key}
					d={a.d}
					stroke={CREAM}
					strokeWidth={a.w}
					strokeLinecap="round"
					vectorEffect="non-scaling-stroke"
					initial={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
					animate={{
						pathLength: 1,
						opacity: on(a.sessions) ? (a.leg === "origin" ? 0.16 : 0.26) : 0.05,
					}}
					transition={
						reduce
							? { duration: 0.2 }
							: { duration: 0.9, ease: EASE, delay: Math.min(i, 24) * 0.04 }
					}
				/>
			))}
			{nodes.map((n, i) => {
				const ink = n.humidity ? HUMIDITY[n.humidity].color : CREAM
				const lit = on(n.sessions)
				return (
					<PxGroup key={n.key} x={n.at[0]} y={n.at[1]}>
						<motion.rect
							x={-3}
							y={-3}
							width={6}
							height={6}
							rx={0.5}
							fill="#121012"
							stroke={ink}
							strokeWidth={1}
							initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
							animate={{ opacity: lit ? 0.75 : 0.2, scale: 1 }}
							transition={
								reduce
									? { duration: 0.2 }
									: { type: "spring", stiffness: 520, damping: 30, delay: 0.3 + i * 0.05 }
							}
						>
							<title>{`${n.title} · ${n.sessions.length} aged here`}</title>
						</motion.rect>
						<rect
							x={-0.9}
							y={-0.9}
							width={1.8}
							height={1.8}
							fill={ink}
							fillOpacity={lit ? 0.7 : 0.2}
						/>
					</PxGroup>
				)
			})}
		</g>
	)
})

/** `// 广州 Guangzhou · aged 6` beside each place (HTML overlay, pinned to the camera). */
export function StorageLabels({ nodes }: { nodes: StorageNode[] }) {
	// places on one point (Kunming and white2tea's storage) share a label, one line each
	const groups = useMemo(() => {
		const at = new Map<string, StorageNode[]>()
		for (const n of nodes) {
			const key = `${r1(n.at[0])},${r1(n.at[1])}`
			at.set(key, [...(at.get(key) ?? []), n])
		}
		return [...at.values()]
	}, [nodes])
	return (
		<>
			{groups.map((group, i) => (
				<StorageLabel key={group[0].key} group={group} i={i} />
			))}
		</>
	)
}

/** a label hangs below and right of its dot */
const besideDot: PinWrite = (s, sx, sy) => {
	s.transform = `translate3d(${sx + 7}px, ${sy + 7}px, 0)`
}

function StorageLabel({ group, i }: { group: StorageNode[]; i: number }) {
	const [x, y] = group[0].at
	const pin = usePin(x, y, besideDot)
	return (
		<motion.span
			ref={pin}
			className="absolute left-0 top-0 flex flex-col gap-0.5 map-label text-[9.5px] leading-none text-white/35 whitespace-nowrap"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.35, ease: EASE, delay: 0.4 + i * 0.05 }}
		>
			{group.map((n) => (
				<span key={n.key}>
					{`// ${n.hanzi ? `${n.hanzi} ` : ""}${n.title} · aged ${n.sessions.length}`}
				</span>
			))}
		</motion.span>
	)
}
