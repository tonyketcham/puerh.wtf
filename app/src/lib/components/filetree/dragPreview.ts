import type { LiquorColor } from "@/lib/liquor"

/**
 * Builds a small offscreen chip (liquor swatch · vintage · title) and hands it to
 * dataTransfer.setDragImage, so dragging a session out of the tree carries a compact,
 * legible token instead of a screenshot of the whole row. The element only needs to exist
 * while the browser snapshots it, so it is removed on the next tick.
 */
export function setSessionDragPreview(
	dataTransfer: DataTransfer,
	{ title, year, liquor }: { title: string; year?: number | null; liquor: LiquorColor }
) {
	if (typeof document === "undefined" || typeof dataTransfer.setDragImage !== "function") return

	const chip = document.createElement("div")
	chip.setAttribute("aria-hidden", "true")
	const chipStyle: Partial<CSSStyleDeclaration> = {
		position: "fixed",
		top: "-1000px",
		left: "-1000px",
		zIndex: "-1",
		display: "flex",
		alignItems: "center",
		gap: "8px",
		maxWidth: "260px",
		padding: "5px 12px 5px 6px",
		borderRadius: "9999px",
		background: "#1f1b1f",
		border: "1px solid rgba(255,255,255,0.14)",
		color: "rgba(255,255,255,0.88)",
		font: "500 12px/16px var(--font-fira-code), ui-monospace, monospace",
		whiteSpace: "nowrap",
		pointerEvents: "none",
	}
	Object.assign(chip.style, chipStyle)

	const swatch = document.createElement("span")
	const swatchStyle: Partial<CSSStyleDeclaration> = {
		flex: "none",
		width: "14px",
		height: "14px",
		borderRadius: "9999px",
		background: liquor.hex,
		opacity: liquor.measured ? "1" : "0.5",
		boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 -3px 4px rgba(0,0,0,0.25)",
	}
	Object.assign(swatch.style, swatchStyle)
	chip.appendChild(swatch)

	if (year) {
		const y = document.createElement("span")
		y.textContent = String(year)
		Object.assign(y.style, { color: "#fff2ca", fontWeight: "700", flex: "none" })
		chip.appendChild(y)
	}

	const t = document.createElement("span")
	t.textContent = title
	Object.assign(t.style, { overflow: "hidden", textOverflow: "ellipsis", minWidth: "0" })
	chip.appendChild(t)

	document.body.appendChild(chip)
	dataTransfer.setDragImage(chip, 13, chip.offsetHeight / 2)
	window.setTimeout(() => chip.remove(), 0)
}
