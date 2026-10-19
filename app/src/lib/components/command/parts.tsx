"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import { cn } from "@/lib/utils/cn"
import type { LiquorColor } from "@/lib/liquor"

/** Text with fuzzy-matched characters emphasized (monospace, so bolding never reflows). */
export function Highlight({
	text,
	indices,
	className,
}: {
	text: string
	indices: number[]
	className?: string
}) {
	if (!indices.length) return <span className={className}>{text}</span>
	const set = new Set(indices)
	const parts: ReactNode[] = []
	let run = ""
	let runMatched = set.has(0)
	const flush = (key: number) => {
		if (!run) return
		parts.push(
			runMatched ? (
				<mark
					key={key}
					className="font-semibold text-white bg-transparent underline decoration-[rgb(237_196_70/0.55)] decoration-1 underline-offset-[3px]"
				>
					{run}
				</mark>
			) : (
				<span key={key}>{run}</span>
			)
		)
	}
	for (let i = 0; i < text.length; i++) {
		const m = set.has(i)
		if (m !== runMatched) {
			flush(i)
			run = ""
			runMatched = m
		}
		run += text[i]
	}
	flush(text.length)
	return <span className={className}>{parts}</span>
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<kbd
			className={cn(
				"inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-[5px] border border-white/10 bg-white/[0.04] font-fira-code text-[10px] leading-none text-white/55 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]",
				className
			)}
		>
			{children}
		</kbd>
	)
}

/** A small "cup" of the tea's measured liquor color; unmeasured (fallback) liquors read as dashed. */
export function LiquorSwatch({ liquor, size = 14 }: { liquor: LiquorColor; size?: number }) {
	return (
		<span
			aria-hidden
			className={cn(
				"relative inline-block rounded-full shrink-0",
				liquor.measured
					? "ring-1 ring-white/15"
					: "outline-1 outline-dashed outline-white/30 opacity-80"
			)}
			style={{
				width: size,
				height: size,
				background: liquor.measured
					? `radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.35), transparent 45%), ${liquor.hex}`
					: `repeating-linear-gradient(135deg, ${liquor.hex}55 0 2px, transparent 2px 4px)`,
				boxShadow: liquor.measured ? `0 0 10px -2px ${liquor.hex}99` : undefined,
			}}
		/>
	)
}

const noopSubscribe = () => () => {}

/** "mac" | "other" on the client, null during SSR/hydration (render a neutral placeholder). */
export function usePlatform(): "mac" | "other" | null {
	return useSyncExternalStore(
		noopSubscribe,
		() => {
			const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
			const p = nav.userAgentData?.platform || navigator.platform || navigator.userAgent
			return /mac|iphone|ipad|ipod/i.test(p) ? "mac" : "other"
		},
		() => null
	)
}
