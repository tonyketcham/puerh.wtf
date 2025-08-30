/**
 * Generate a deterministic but varied rotation value for a session
 * based on its slug. This creates subtle visual variety between sessions
 * while maintaining consistency for the same session.
 *
 * @param slug - The session slug to generate rotation from
 * @param minRotation - Minimum rotation in degrees (default: -15)
 * @param maxRotation - Maximum rotation in degrees (default: 15)
 * @returns A rotation value in degrees
 */
export function generateSessionRotation(
	slug: string,
	minRotation: number = -15,
	maxRotation: number = 15
): number {
	// Simple hash function to convert string to number
	let hash = 0
	for (let i = 0; i < slug.length; i++) {
		const char = slug.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // Convert to 32-bit integer
	}

	// Normalize hash to 0-1 range and map to rotation range
	const normalizedHash = Math.abs(hash) / 2147483647 // Max 32-bit integer
	const rotation = minRotation + normalizedHash * (maxRotation - minRotation)

	// Round to 1 decimal place for cleaner CSS values
	return Math.round(rotation * 10) / 10
}
