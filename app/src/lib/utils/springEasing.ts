/**
 * A spring baked into a CSS `linear()` easing, so a Web Animation can run Motion's spring on
 * the compositor instead of stepping it from JavaScript every frame.
 *
 * Motion's springs start at rest (no carried velocity here), so the closed-form response of a
 * damped harmonic oscillator released from one unit of displacement is exact. Sampled at about
 * 120 points a second, which keeps `linear()` within a hair of the curve.
 */
export type SpringOptions = { stiffness: number; damping: number; mass?: number }

export type BakedSpring = { easing: string; duration: number }

const cache = new Map<string, BakedSpring>()
/** where Motion calls a spring settled, as a share of the travel */
const REST = 0.001
const STEP = 1 / 120
const MAX_SECONDS = 2

/** Fallback for engines without `linear()` (Safari before 17.2): the drawer's own curve. */
const FALLBACK: BakedSpring = { easing: "cubic-bezier(0.22, 1, 0.36, 1)", duration: 350 }

let linearSupported: boolean | null = null
const supportsLinear = () =>
	(linearSupported ??=
		typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)"))

export function springEasing({ stiffness, damping, mass = 1 }: SpringOptions): BakedSpring {
	if (!supportsLinear()) return FALLBACK
	const key = `${stiffness}/${damping}/${mass}`
	const hit = cache.get(key)
	if (hit) return hit

	const w0 = Math.sqrt(stiffness / mass)
	const zeta = damping / (2 * Math.sqrt(stiffness * mass))
	// displacement left at time t (1 → 0)
	const displacement =
		zeta < 1
			? (t: number) => {
					const wd = w0 * Math.sqrt(1 - zeta * zeta)
					return (
						Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
					)
			  }
			: zeta === 1
			? (t: number) => Math.exp(-w0 * t) * (1 + w0 * t)
			: (t: number) => {
					const s = Math.sqrt(zeta * zeta - 1)
					const r1 = -w0 * (zeta - s)
					const r2 = -w0 * (zeta + s)
					return (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1)
			  }

	// settled once the envelope (not just a zero crossing) has fallen under REST
	const envelope = (t: number) =>
		zeta < 1 ? Math.exp(-zeta * w0 * t) * (1 / Math.sqrt(1 - zeta * zeta)) : Math.abs(displacement(t))
	let end = STEP
	while (end < MAX_SECONDS && envelope(end) > REST) end += STEP

	const points: string[] = []
	for (let t = 0; t < end; t += STEP) points.push((1 - displacement(t)).toFixed(4))
	points.push("1")
	const baked = { easing: `linear(${points.join(", ")})`, duration: Math.round(end * 1000) }
	cache.set(key, baked)
	return baked
}
