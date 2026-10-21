import type { SessionFlavorAxes } from "./types/session"

/** -1 is the stored sentinel for a session that has not been rated. */
export const isRated = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100

/** A finish phase is available only when every axis was recorded. Zero is a valid score. */
export function hasFinishProfile(
	data: Record<string, { start: number; finish?: number | null }> | null | undefined
): boolean {
	const axes = Object.values(data ?? {})
	return (
		axes.length > 0 &&
		axes.every((axis) => typeof axis.finish === "number" && Number.isFinite(axis.finish))
	)
}

/** An unscored finish must not halve the strength of a single recorded profile. */
export function flavorMidpoint(profile: SessionFlavorAxes, axis: keyof SessionFlavorAxes): number {
	const value = profile[axis]
	return hasFinishProfile(profile) ? (value.start + (value.finish ?? value.start)) / 2 : value.start
}
