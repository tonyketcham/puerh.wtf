"use client"

/**
 * Supply lines (plan §3.3, §4.5 step 7): an arc from each origin to the city its vendor ships
 * from, one per (origin, vendor) pair, heavier for more sessions. Vendors on the map get a
 * diamond; the rest of the world sits off the edge, so each far vendor is tagged where its
 * line leaves the view (→ Mei Leaf · London 8,500 km), recomputed when the camera settles.
 */
import { memo, useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import type { Camera } from "./camera"
import { CREAM, EASE, projectShared, type Box, type Point } from "./geo"
import { VENDOR_PLACES } from "./vendorPlaces"

export type SupplyPair = {
	origin: Point
	vendor: string
	vendorTitle: string
	count: number
}

type Vendor = { slug: string; title: string; place: string; at: Point; km: number; count: number }

/** Great-circle km from the tea mountains (Yiwu) to a lon/lat. */
function kmFromYunnan(lon: number, lat: number) {
	const R = 6371
	const toRad = Math.PI / 180
	const [lon0, lat0] = [101.47, 21.98]
	const dLat = (lat - lat0) * toRad
	const dLon = (lon - lon0) * toRad
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat0 * toRad) * Math.cos(lat * toRad) * Math.sin(dLon / 2) ** 2
	return 2 * R * Math.asin(Math.sqrt(a))
}

export function useSupplyVendors(pairs: SupplyPair[]): Vendor[] {
	return useMemo(() => {
		const by = new Map<string, Vendor>()
		for (const p of pairs) {
			const place = VENDOR_PLACES[p.vendor]
			if (!place) continue
			const v = by.get(p.vendor) ?? {
				slug: p.vendor,
				title: p.vendorTitle,
				place: place.place,
				at: projectShared(place.lon, place.lat),
				km: kmFromYunnan(place.lon, place.lat),
				count: 0,
			}
			v.count += p.count
			by.set(p.vendor, v)
		}
		return [...by.values()].sort((a, b) => b.count - a.count)
	}, [pairs])
}

/** The arcs (shared units). */
export const SupplyArcs = memo(function SupplyArcs({
	pairs,
	reduce,
}: {
	pairs: SupplyPair[]
	reduce: boolean
}) {
	const arcs = useMemo(
		() =>
			pairs
				.map((p) => {
					const place = VENDOR_PLACES[p.vendor]
					if (!place) return null
					const [x1, y1] = projectShared(place.lon, place.lat)
					const [x0, y0] = p.origin
					const dx = x1 - x0
					const dy = y1 - y0
					// bow the arc to the left of travel by a fifth of its length
					const cx = (x0 + x1) / 2 - dy * 0.2
					const cy = (y0 + y1) / 2 + dx * 0.2
					const r = (v: number) => Math.round(v * 10) / 10
					return {
						key: `${p.vendor}@${p.origin.join(",")}`,
						d: `M${r(x0)} ${r(y0)}Q${r(cx)} ${r(cy)} ${r(x1)} ${r(y1)}`,
						w: 0.7 + Math.log2(1 + p.count) * 0.45,
					}
				})
				.filter((a): a is { key: string; d: string; w: number } => !!a),
		[pairs]
	)
	return (
		<g fill="none" className="pointer-events-none">
			{arcs.map((a, i) => (
				<motion.path
					key={a.key}
					d={a.d}
					stroke={CREAM}
					strokeOpacity={0.3}
					strokeWidth={a.w}
					strokeDasharray="2 5"
					strokeLinecap="round"
					vectorEffect="non-scaling-stroke"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : Math.min(i, 30) * 0.015 }}
				/>
			))}
		</g>
	)
})

/** Vendor marks on the map, and edge tags for the vendors beyond it (screen px overlay). */
export function SupplyTags({ vendors, camera }: { vendors: Vendor[]; camera: Camera }) {
	const [view, setView] = useState<{ box: Box; W: number; H: number } | null>(null)
	useEffect(() => {
		let t = 0
		const read = () => {
			window.clearTimeout(t)
			t = window.setTimeout(
				() => setView({ box: camera.view(), W: camera.width.get(), H: camera.height.get() }),
				90
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
	if (!view || !view.W) return null
	const [vx, vy, vw, vh] = view.box
	const k = view.W / vw
	const inside: (Vendor & { sx: number; sy: number })[] = []
	const edge: (Vendor & { sx: number; sy: number; side: "l" | "r" | "t" | "b" })[] = []
	const [cx, cy] = [vx + vw / 2, vy + vh / 2]
	for (const v of vendors) {
		const [x, y] = v.at
		if (x >= vx && x <= vx + vw && y >= vy && y <= vy + vh) {
			inside.push({ ...v, sx: (x - vx) * k, sy: (y - vy) * k })
			continue
		}
		// where the ray from the view center to the vendor leaves the view
		const dx = x - cx
		const dy = y - cy
		const tx = dx ? (dx > 0 ? vx + vw - cx : vx - cx) / dx : Infinity
		const ty = dy ? (dy > 0 ? vy + vh - cy : vy - cy) / dy : Infinity
		const t = Math.min(tx, ty)
		const ex = cx + dx * t
		const ey = cy + dy * t
		const side = tx < ty ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t"
		edge.push({ ...v, sx: (ex - vx) * k, sy: (ey - vy) * k, side })
	}
	// keep edge tags from stacking: nudge along their edge
	edge.sort((a, b) => a.side.localeCompare(b.side) || a.sy - b.sy || a.sx - b.sx)
	for (let i = 1; i < edge.length; i++) {
		const a = edge[i - 1]
		const b = edge[i]
		if (a.side !== b.side) continue
		if ((b.side === "l" || b.side === "r") && b.sy - a.sy < 18) b.sy = a.sy + 18
		if ((b.side === "t" || b.side === "b") && b.sx - a.sx < 150) b.sx = a.sx + 150
	}
	// vendors in the same city (or within a few px) share one diamond and a stacked list
	const groups: { sx: number; sy: number; place: string; vendors: Vendor[] }[] = []
	for (const v of inside) {
		const g = groups.find((g) => Math.hypot(g.sx - v.sx, g.sy - v.sy) < 14)
		if (g) g.vendors.push(v)
		else groups.push({ sx: v.sx, sy: v.sy, place: v.place, vendors: [v] })
	}
	const arrow = { l: "←", r: "→", t: "↑", b: "↓" } as const
	return (
		<div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
			{groups.map((g) => (
				<span key={g.vendors[0].slug} className="absolute" style={{ left: g.sx, top: g.sy }}>
					<span className="absolute -left-1 -top-1 size-2 rotate-45 ring-1 ring-[#fff2ca]/70 bg-[#121012]" />
					{/* to the left: origin labels sit to the right of their rings */}
					<span className="absolute right-3 top-0 -translate-y-1/2 flex flex-col items-end gap-px px-1 py-0.5 rounded-[3px] bg-[#121012]/85 text-[10px] leading-tight text-white/60 map-label whitespace-nowrap">
						{g.vendors.map((v) => (
							<span key={v.slug}>
								<span className="text-white/35">@</span>
								{v.title}
							</span>
						))}
						<span className="text-white/30">{g.place}</span>
					</span>
				</span>
			))}
			{edge.map((v) => {
				const W = view.W
				const H = view.H
				const pad = 10
				const style =
					v.side === "l"
						? { left: pad, top: clamp(v.sy, 40, H - 40), transform: "translateY(-50%)" }
						: v.side === "r"
						? { right: pad, top: clamp(v.sy, 40, H - 40), transform: "translateY(-50%)" }
						: v.side === "t"
						? { top: pad + 22, left: clamp(v.sx, 80, W - 80), transform: "translateX(-50%)" }
						: { bottom: pad + 26, left: clamp(v.sx, 80, W - 80), transform: "translateX(-50%)" }
				return (
					<motion.span
						key={v.slug}
						className="absolute px-1.5 py-1 rounded-[3px] bg-[#121012]/90 ring-1 ring-inset ring-white/[0.08] text-[10px] leading-none text-white/55 map-label whitespace-nowrap tabular-nums"
						style={style}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.3, ease: EASE }}
					>
						<span className="text-[#fff2ca]/60">{arrow[v.side]}</span> {v.title}
						<span className="text-white/30">
							{" "}
							· {v.place}{" "}
							{Math.round(v.km / 100) * 100 >= 1000
								? `${(Math.round(v.km / 100) * 100).toLocaleString("en-US")} km`
								: `${Math.round(v.km)} km`}
						</span>
					</motion.span>
				)
			})}
		</div>
	)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
