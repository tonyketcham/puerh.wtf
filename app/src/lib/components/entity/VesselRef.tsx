"use client"

import { useMemo } from "react"
import { PEEK_META, vesselKey } from "@/lib/peek"
import { chain, usePeekTrigger } from "@/lib/components/entity/peek/usePeekTrigger"
import { usePeekController } from "@/lib/components/entity/peek/controller"
import { cn } from "@/lib/utils/cn"

/**
 * The brewing vessel as a peekable chip (a stub until the vessels collection and /teaware
 * land, plan §3.5): hover or focus peeks the sessions brewed in it and its average brew.
 * There's no page to go to yet, so a click pins the card instead.
 */
export default function VesselRef({
	vessel,
	className,
	recordingKey,
}: {
	vessel: string
	className?: string
	recordingKey?: string
}) {
	const key = vesselKey(vessel)
	const target = useMemo(() => (key ? { kind: "vessel" as const, key } : null), [key])
	const { handlers, status } = usePeekTrigger<HTMLButtonElement>(target)
	const peek = usePeekController()
	return (
		<button
			type="button"
			{...handlers}
			// a click pins the card (aria-expanded / aria-controls come with the handlers)
			aria-haspopup="dialog"
			onClick={chain(handlers.onClick, (e) => {
				if (!e.defaultPrevented && target) peek.togglePin(target, e.currentTarget)
			})}
			data-recording-key={recordingKey}
			className={cn(
				"group/ref inline-flex min-w-0 max-w-full items-center gap-1 align-middle font-fira-code outline-none",
				"h-6 px-1.5 rounded-[4px] text-xs text-white/80 [-webkit-touch-callout:none]",
				"ring-1 ring-inset ring-white/[0.08] bg-white/[0.025]",
				"transition-[color,background-color,box-shadow] duration-150",
				"hover:text-white hover:ring-white/20 hover:bg-white/[0.06] focus-visible:ring-white/50",
				status && "text-white ring-[#fff2ca]/30 bg-[#fff2ca]/[0.06]",
				className
			)}
		>
			<span aria-hidden className="text-[0.9em] leading-none text-white/35">
				{PEEK_META.vessel.glyph}
			</span>
			<span className="min-w-0 truncate">{vessel}</span>
		</button>
	)
}
