"use client"

import React from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"

interface DetailsListItemProps
	extends Omit<React.LiHTMLAttributes<HTMLLIElement>, "title" | "value"> {
	icon: React.ReactNode
	title: string
	value: React.ReactNode
	/**
	 * Cross-highlight state (e.g. the photo cube is showing this note). When defined, the row
	 * gets an IDE-style "current line" treatment: a liquor gutter bar and a faint wash.
	 */
	active?: boolean
	/** Trailing content on the title line (e.g. a photo thumb glyph) */
	aside?: React.ReactNode
}

export default function DetailsListItem({
	icon,
	title,
	value,
	active,
	aside,
	className,
	...rest
}: DetailsListItemProps) {
	const reduced = useReducedMotion()
	const linkable = active !== undefined
	const spring = reduced
		? { duration: 0 }
		: { type: "spring" as const, stiffness: 520, damping: 40 }

	return (
		<li
			className={cn("relative flex flex-col justify-between w-full space-y-2 text-xs", className)}
			data-active={active || undefined}
			{...rest}
		>
			{linkable && (
				<>
					<motion.span
						aria-hidden
						className="absolute rounded-md pointer-events-none -inset-x-2 -inset-y-1.5"
						style={{ backgroundColor: "rgb(var(--liquor-rgb, 237 196 70) / 0.07)" }}
						initial={false}
						animate={{ opacity: active ? 1 : 0 }}
						transition={reduced ? { duration: 0 } : { duration: 0.18 }}
					/>
					<motion.span
						aria-hidden
						className="absolute top-0 bottom-0 w-0.5 rounded-full pointer-events-none -left-3 origin-center"
						style={{ backgroundColor: "var(--liquor-text, #edc446)" }}
						initial={false}
						animate={{ opacity: active ? 1 : 0, scaleY: active ? 1 : 0.3 }}
						transition={spring}
					/>
				</>
			)}
			<div className="relative flex items-center space-x-2">
				{icon && (
					<span
						className="flex shrink-0 transition-colors duration-200"
						style={{
							color: active
								? "var(--liquor-text, #edc446)"
								: "rgb(var(--liquor-rgb, 237 196 70) / 0.7)",
						}}
					>
						{icon}
					</span>
				)}
				<span className="flex-1 font-fira-code text-brand">{title}</span>
				{aside}
			</div>
			<span className="relative text-ink-muted">{value}</span>
		</li>
	)
}
