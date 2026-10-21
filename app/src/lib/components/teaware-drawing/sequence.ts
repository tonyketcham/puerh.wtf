/**
 * Each drawing presents itself as a short turntable sequence: a list of shots (a pose and how long
 * to hold it), joined by quick, eased camera moves. Pure module, no DOM.
 */

/** where the camera is and how far the lids are lifted */
export interface Pose {
	yaw: number
	pitch: number
	/** 0 seated … 1 lifted */
	explode: number
}

export interface Shot extends Pose {
	/** ms held once arrived */
	hold: number
	/** ms of the move into this shot (the first shot is arrived at by the draw-on) */
	move?: number
}

/** the move into a shot when it doesn't say */
export const MOVE_MS = 900

/** A CSS-style cubic-bézier easing, solved for x by Newton's method. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
	const bez = (t: number, a: number, b: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3
	const slope = (t: number, a: number, b: number) =>
		3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t
	return (x: number) => {
		if (x <= 0) return 0
		if (x >= 1) return 1
		let t = x
		for (let i = 0; i < 6; i++) {
			const d = slope(t, x1, x2)
			if (Math.abs(d) < 1e-6) break
			t -= (bez(t, x1, x2) - x) / d
		}
		return bez(Math.min(1, Math.max(0, t)), y1, y2)
	}
}

/** quick to leave, long to settle: a camera that knows where it's going */
export const ease = cubicBezier(0.7, 0, 0.2, 1)

export const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
	yaw: a.yaw + (b.yaw - a.yaw) * t,
	pitch: a.pitch + (b.pitch - a.pitch) * t,
	explode: a.explode + (b.explode - a.explode) * t,
})

/** total ms a sequence runs once its first shot has drawn on */
export const runtime = (shots: Shot[]) =>
	shots.reduce((sum, s, i) => sum + s.hold + (i ? s.move ?? MOVE_MS : 0), 0)
