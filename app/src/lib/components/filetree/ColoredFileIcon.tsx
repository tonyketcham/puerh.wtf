import { liquorInk, type LiquorColor } from "@/lib/liquor"

interface ColoredFileIconProps {
	/** outline color (the session's category color) */
	color?: string
	/**
	 * Liquor color to fill the page body with. Measured liquors fill solid so the tree reads
	 * as a swatch strip of the whole log; the amber fallback is shown as a faint wash so it
	 * doesn't masquerade as a real measurement.
	 */
	liquor?: LiquorColor | null
	/** solid fill color for non-session nodes (e.g. a category's own color) */
	fill?: string
}

const BODY =
	"M3.96327 2.66668V13.3333C3.96327 13.687 4.10375 14.0261 4.3538 14.2762C4.60384 14.5262 4.94298 14.6667 5.29661 14.6667H13.2966C13.6502 14.6667 13.9894 14.5262 14.2394 14.2762C14.4895 14.0261 14.6299 13.687 14.6299 13.3333V5.56134C14.6299 5.38372 14.5944 5.20788 14.5255 5.04417C14.4566 4.88046 14.3556 4.73217 14.2286 4.60801L11.2686 1.71334C11.0195 1.46978 10.685 1.33339 10.3366 1.33334H5.29661C4.94298 1.33334 4.60384 1.47382 4.3538 1.72387C4.10375 1.97392 3.96327 2.31305 3.96327 2.66668V2.66668Z"
const FOLD =
	"M10.63 1.66666V3.99999C10.63 4.35361 10.7704 4.69275 11.0205 4.9428C11.2705 5.19285 11.6097 5.33332 11.9633 5.33332H14.2629"
/** the dog-ear triangle, filled slightly darker than the body */
const FOLD_FILL = "M10.63 1.5V4C10.63 4.7 11.2 5.33 11.96 5.33H14.5Z"

export default function ColoredFileIcon({ color = "white", liquor, fill }: ColoredFileIconProps) {
	const bodyFill = liquor?.hex ?? fill
	const bodyOpacity = liquor ? (liquor.measured ? 1 : 0.32) : fill ? 0.85 : 0
	// text lines sit on the fill; pick ink that reads on it (white when the fill is faint)
	const lineInk =
		liquor && liquor.measured
			? liquorInk(liquor.rgb)
			: bodyFill && bodyOpacity > 0.5
			? "#121012"
			: "white"

	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="w-4 h-4 shrink-0"
			style={{ color }}
			aria-hidden="true"
		>
			{bodyFill && <path d={BODY} fill={bodyFill} fillOpacity={bodyOpacity} />}
			{bodyFill && bodyOpacity > 0.5 && <path d={FOLD_FILL} fill="#121012" fillOpacity={0.28} />}
			<path
				d={BODY}
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.29663 8H11.2966"
				stroke={lineInk}
				strokeOpacity={lineInk === "white" ? 1 : 0.55}
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.29663 11.3333H9.29663"
				stroke={lineInk}
				strokeOpacity={lineInk === "white" ? 1 : 0.55}
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d={FOLD}
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}
