import type { ReactNode } from "react"

/** The small caps line that heads an Explorer view: label · count, actions on the right. */
export default function ViewHeader({
	label,
	count,
	noun,
	children,
}: {
	label: string
	count: number
	/** what the count counts, e.g. "places" */
	noun: string
	children?: ReactNode
}) {
	return (
		<div className="flex items-center justify-between h-6 px-2 mb-1 text-[10px] leading-4">
			<span className="tracking-[0.14em] uppercase text-white/35">
				{label}
				<span className="ml-2 tracking-normal normal-case tabular-nums text-white/25">
					{count} {noun}
				</span>
			</span>
			{children}
		</div>
	)
}
