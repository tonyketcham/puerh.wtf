/**
 * Pure geometry + color helpers for the flavor radar.
 */
import type { LiquorColor } from "@/lib/liquor"

export type RadarAxisData = Record<string, { start: number; finish: number }>

/** Per-axis start / finish arrays, aligned to an axes list. */
export type RadarSeries = { s: number[]; f: number[] }

export type Point = { x: number; y: number }

export const VIEWBOX = 380
export const CENTER = VIEWBOX / 2
export const RADIUS = VIEWBOX / 2 - 90
export const MAX_VALUE = 10

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function lerpArray(a: number[], b: number[], t: number): number[] {
	const n = Math.max(a.length, b.length)
	const out = new Array<number>(n)
	for (let i = 0; i < n; i++) out[i] = lerp(a[i] ?? 0, b[i] ?? 0, t)
	return out
}

export function seriesFor(axes: string[], data: RadarAxisData | null | undefined): RadarSeries {
	return {
		s: axes.map((a) => data?.[a]?.start ?? 0),
		f: axes.map((a) => data?.[a]?.finish ?? 0),
	}
}

/** Values at a phase (0 = start, 1 = finish). */
export const valuesAtPhase = (series: RadarSeries, phase: number) =>
	lerpArray(series.s, series.f, phase)

export const axisAngle = (i: number, count: number) => ((Math.PI * 2) / count) * i - Math.PI / 2

export function polar(i: number, count: number, value: number, radius = RADIUS): Point {
	// springs may overshoot; never let a vertex cross the center or fly far past the rim
	const v = clamp(value, 0, MAX_VALUE * 1.06)
	const r = (v / MAX_VALUE) * radius
	const a = axisAngle(i, count)
	return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) }
}

export function pointsFor(values: number[]): Point[] {
	return values.map((v, i) => polar(i, values.length, v))
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function pathFor(points: Point[]): string {
	if (!points.length) return "M0 0Z"
	return points.map((p, i) => `${i === 0 ? "M" : "L"} ${r2(p.x)} ${r2(p.y)}`).join(" ") + "Z"
}

export function polygonPoints(values: number[]): string {
	return pointsFor(values)
		.map((p) => `${r2(p.x)},${r2(p.y)}`)
		.join(" ")
}

/** "+2", "−1.5", "±0" (typographic minus). */
export function formatDelta(d: number): string {
	const r = Math.round(d * 10) / 10
	if (Math.abs(r) < 0.05) return "±0"
	const abs = Number.isInteger(r) ? Math.abs(r).toFixed(0) : Math.abs(r).toFixed(1)
	return `${r > 0 ? "+" : "−"}${abs}`
}

export function formatAxisLabel(axis: string): string {
	return axis.replace(/_/g, " ")
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/** OKLCH of the amber fallback (#d9a441), for liquors without a measured value. */
const FALLBACK_OKLCH: [number, number, number] = [0.762, 0.132, 78]

function oklchOf(color: LiquorColor): [number, number, number] {
	return color.oklch ?? FALLBACK_OKLCH
}

const fmtOklch = (l: number, c: number, h: number) =>
	`oklch(${l.toFixed(3)} ${c.toFixed(3)} ${Number.isFinite(h) ? h.toFixed(1) : 0})`

/**
 * Liquor color lifted so it reads as a stroke on the #121012 ground. Dark liquors (shou,
 * aged sheng) keep their hue but come up to a legible lightness; pale/olive liquors gain a
 * little chroma so they don't read as grey.
 */
export function radarAccent(color: LiquorColor): string {
	const [l, c, h] = oklchOf(color)
	return fmtOklch(clamp(l, 0.72, 0.86), clamp(c, 0.07, 0.19), h)
}

const hueDistance = (a: number, b: number) => {
	const d = Math.abs((((a - b) % 360) + 360) % 360)
	return Math.min(d, 360 - d)
}

/**
 * Accent for the compared tea. When both liquors share a hue family (very common: amber vs
 * amber), the other tea goes paler and slightly cooler so the diff stays legible.
 */
export function radarCompareAccent(current: LiquorColor, other: LiquorColor): string {
	const [l1, , h1] = oklchOf(current)
	const [l2, c2, h2] = oklchOf(other)
	const close = hueDistance(h1, h2) < 28 && Math.abs(l1 - l2) < 0.18
	if (!close) return radarAccent(other)
	return fmtOklch(0.9, clamp(c2 * 0.7, 0.05, 0.12), h2 + (h2 >= h1 ? 14 : -14))
}

/** Translucent version of any CSS color. */
export const withAlpha = (color: string, pct: number) =>
	`color-mix(in oklab, ${color} ${Math.round(pct)}%, transparent)`
