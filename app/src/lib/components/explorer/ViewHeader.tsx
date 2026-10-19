import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

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

/**
 * "index ↗": opens the view's full page (/vendors, /styles, /lexicon), the way Origins'
 * "map" switch opens the map. Lit while that page is the one open.
 */
export function IndexLink({
	href,
	pathname,
	label = "index",
	recordingKey,
}: {
	/** with its trailing slash */
	href: string
	/** the current pathname without its trailing slash */
	pathname: string
	label?: string
	recordingKey?: string
}) {
	const here = pathname === href.replace(/\/+$/, "")
	return (
		<Link
			href={href}
			prefetch={false}
			aria-current={here ? "page" : undefined}
			title={here ? "You're on the index" : `Open the full ${label}`}
			data-recording-key={recordingKey}
			className={cn(
				"group/index flex items-center gap-1 h-5 pl-1.5 pr-1 rounded-sm text-[10px] leading-none",
				"transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/25",
				here
					? "text-brand/90 bg-brand/[0.08]"
					: "text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
			)}
		>
			{label}
			<ArrowUpRight
				size={10}
				strokeWidth={2.25}
				aria-hidden
				className="transition-transform duration-200 ease-out group-hover/index:-translate-y-px group-hover/index:translate-x-px motion-reduce:transition-none motion-reduce:transform-none"
			/>
		</Link>
	)
}
