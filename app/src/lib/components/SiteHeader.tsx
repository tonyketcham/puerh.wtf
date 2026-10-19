import Link from "next/link"
import Github from "./icons/Github"
import Instagram from "./icons/Instagram"
import { cn } from "@/lib/utils/cn"

/** `compact` is the narrow-screen masthead: same mark, one size down, links at its side. */
export default function SiteHeader({
	compact = false,
	className,
}: {
	compact?: boolean
	className?: string
}) {
	return (
		<header className={cn("flex flex-row justify-between px-4 py-1 font-rock-3d", className)}>
			<Link href="/" aria-label="home" className="pointer-events-auto">
				<h1
					className={cn(
						"text-bai-cha-100 select-none drop-shadow-split",
						compact ? "text-[44px] leading-9" : "text-[64px] leading-13"
					)}
				>
					<span>puerh</span>
					<br />
					<span className={cn("block", compact ? "-ml-3" : "-ml-4")}>.wtf</span>
				</h1>
			</Link>

			<div
				className={cn(
					"flex opacity-80 text-white",
					compact ? "flex-row items-center gap-3" : "flex-col m-auto space-y-1.5 pt-4"
				)}
			>
				<a
					aria-label="source code"
					href="https://github.com/tonyketcham/puerh.wtf"
					className="w-6 outline-hidden pointer-events-auto focus:outline-hidden"
				>
					<Github />
				</a>

				<a
					aria-label="puerh.wtf instagram"
					href="https://instagram.com/puerh.wtf/"
					className="w-6 outline-hidden pointer-events-auto focus:outline-hidden"
				>
					<Instagram />
				</a>
			</div>
		</header>
	)
}
