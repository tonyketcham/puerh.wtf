import type { SVGProps } from "react"
import type { NoteStage } from "@/lib/types/session"
import { cn } from "@/lib/utils/cn"

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">

/** 16px line icons drawn on one grid: 1.25 stroke, round caps, currentColor. */
function Icon({ className, children, ...rest }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			aria-hidden
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.25}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={cn("size-4 shrink-0", className)}
			{...rest}
		>
			{children}
		</svg>
	)
}

// --------------------------------------------------------------------------- tasting stages

/**
 * One stroke (or filled shape) of a stage icon. Stage icons are data so MorphStageIcon can
 * flubber one stage into the next part by part; circles are written as two-arc paths.
 */
export type IconPart = {
	d: string
	strokeWidth?: number
	strokeOpacity?: number
	/** filled shape instead of a stroke */
	fillOpacity?: number
	dash?: string
}

const circle = (cx: number, cy: number, r: number) =>
	`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`

export const STAGE_ICON_PARTS: Record<NoteStage, IconPart[]> = {
	// a single pointed leaf, midrib and veins
	dry_leaf_nose: [
		{ d: "M3 13C3 7.5 6.8 3 13 3c0 6.2-4.5 10-10 10Z" },
		{ d: "M2 14l8.2-8.2" },
		{ d: "M5.6 10.4V8.3M5.6 10.4h2.1M7.8 8.2V6.4M7.8 8.2h1.8", strokeWidth: 1 },
	],
	// an unfurled leaf under a falling drop
	wet_leaf_nose: [
		{ d: "M2.5 13.5c0-4.4 2.6-7 7-7 0 4.4-2.6 7-7 7Z" },
		{ d: "M2.5 13.5 6.8 9.2" },
		{ d: "M12.5 2c.9 1.3 2 2.7 2 3.9a2 2 0 0 1-4 0c0-1.2 1.1-2.6 2-3.9Z" },
	],
	// lips, parted
	mouthfeel: [
		{
			d: "M1.75 8.25C3.4 5.6 5.6 4.6 6.9 5.7c.5.4 1.1.6 1.1.6s.6-.2 1.1-.6c1.3-1.1 3.5-.1 5.15 2.55",
		},
		{ d: "M1.75 8.25C4 12 12 12 14.25 8.25" },
		{ d: "M1.75 8.25c3.2.7 9.3.7 12.5 0", strokeWidth: 1 },
	],
	// a pinming cup with liquor and a thread of steam
	taste: [
		{
			d: "M3.1 9h9.8l-.4 2.1c-.3 1.3-1.4 2.2-2.7 2.2H6.2c-1.3 0-2.4-.9-2.7-2.2Z",
			fillOpacity: 0.35,
		},
		{ d: "M2.5 6.5h11l-1 4.6c-.3 1.3-1.4 2.2-2.7 2.2H6.2c-1.3 0-2.4-.9-2.7-2.2Z" },
		{ d: "M3.1 9h9.8", strokeWidth: 1 },
		{ d: "M8 4.6c-.7-.7.7-1.3 0-2.1", strokeWidth: 1 },
	],
	// the aftertaste: a wave that lingers and fades
	finish: [
		{ d: "M1.5 8c1-4.4 2.4-4.4 3.3 0s2.2 3.2 3 0" },
		{ d: "M7.8 8c.6-2.6 1.8-2.6 2.4 0s1.4 1.3 1.9 0", strokeOpacity: 0.6 },
		{ d: "M13.6 8h.01M15 8h.01", strokeOpacity: 0.35 },
	],
	// looking down into the cup: rim, foot ring, a last tea stain
	empty_cup: [
		{ d: circle(8, 8, 5.75) },
		{ d: circle(8, 8, 2.6), strokeWidth: 1, dash: "1.4 1.2" },
		{ d: circle(9.9, 5.6, 0.55), fillOpacity: 1 },
	],
	// qi rising off the body, in three wisps
	cha_qi: [
		{ d: "M8 14.25c-2.6-2.3 1.9-4.2 0-6.9S7.4 2.9 9.4 1.75" },
		{ d: "M4.6 13c-1.5-1.5.9-2.7-.2-4.6", strokeOpacity: 0.6 },
		{ d: "M11.4 13c1.5-1.5-.9-2.7.2-4.6", strokeOpacity: 0.6 },
	],
}

/** SVG attributes for one icon part (shared with MorphStageIcon) */
export function iconPartAttrs(part: IconPart) {
	return part.fillOpacity != null
		? { fill: "currentColor", fillOpacity: part.fillOpacity, stroke: "none" }
		: {
				strokeWidth: part.strokeWidth,
				strokeOpacity: part.strokeOpacity,
				strokeDasharray: part.dash,
		  }
}

export function NoteStageIcon({ stage, ...props }: IconProps & { stage: NoteStage }) {
	return (
		<Icon {...props}>
			{STAGE_ICON_PARTS[stage].map((part, i) => (
				<path key={i} d={part.d} {...iconPartAttrs(part)} />
			))}
		</Icon>
	)
}

// --------------------------------------------------------------------------- section marks

/** Gaiwan: lid, bowl, saucer */
export function GaiwanIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M6.9 4.3c0-1.2 2.2-1.2 2.2 0" />
			<path d="M3 6.6c1-2.4 9-2.4 10 0" />
			<path d="M3.5 7.4h9c-.2 2.6-2 4.1-4.5 4.1s-4.3-1.5-4.5-4.1Z" />
			<path d="M2 13.25h12M6.2 11.3l-.5 1.95M9.8 11.3l.5 1.95" />
		</Icon>
	)
}

/** Notebook: bound pages, ruled */
export function NotebookIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M4.5 2.25h7.25a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4.5Z" />
			<path d="M6.5 2.25v11.5" strokeWidth={1} />
			<path d="M3.25 5h2.5M3.25 8h2.5M3.25 11h2.5M8.5 5.75h2.5M8.5 8h2.5" />
		</Icon>
	)
}

/** Tag: a label on a string, for the particulars */
export function TagIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M2.5 3.5v4.1l6.1 6.1a1 1 0 0 0 1.4 0l3.7-3.7a1 1 0 0 0 0-1.4L7.6 2.5H3.5a1 1 0 0 0-1 1Z" />
			<circle cx="5.4" cy="5.4" r="1" />
		</Icon>
	)
}

// --------------------------------------------------------------------------- radar diff

/** Diff: two radar outlines laid over each other — this tea solid, the other dashed */
export function RadarDiffIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M6 2 10.2 5l-1.6 4.9H3.4L1.8 5Z" />
			<path d="M10 6.1 14.2 9.1l-1.6 4.9H7.4L5.8 9.1Z" strokeDasharray="1.6 1.4" />
		</Icon>
	)
}

/** Close: a plain cross */
export function CrossIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M4 4l8 8M12 4l-8 8" strokeWidth={1.75} />
		</Icon>
	)
}
