"use client"

import Link from "next/link"
import { useMemo, type CSSProperties, type ReactNode, type SyntheticEvent } from "react"
import { useMorphClick } from "@/lib/components/entity/page/viewTransition"
import { usePeekTrigger } from "@/lib/components/entity/peek/usePeekTrigger"
import { lexiconHref, type LexiconEntry } from "@/lib/lexicon"
import { cn } from "@/lib/utils"

/**
 * A word of the lexicon as a link to its page: it peeks on hover / focus like every entity
 * reference (the descriptor card: stages, company, sessions) and, on a plain click, grows into
 * the page's Rock 3D title.
 */
export default function LexiconWord({
	entry,
	children,
	className,
	style,
	onHover,
	dataAttributes,
	recordingKey,
}: {
	entry: LexiconEntry
	children?: ReactNode
	className?: string
	style?: CSSProperties
	/** pointer or focus arrives (true) / leaves (false) */
	onHover?: (on: boolean) => void
	/** extra data-* attributes for the link (the Explorer's keyboard walk, the peek placement) */
	dataAttributes?: Record<`data-${string}`, string>
	recordingKey?: string
}) {
	const target = useMemo(() => ({ kind: "descriptor" as const, key: entry.term }), [entry.term])
	const { handlers, status } = usePeekTrigger<HTMLAnchorElement>(target)
	const href = lexiconHref(entry.slug)
	const morph = useMorphClick("descriptor", entry.slug, href)

	return (
		<Link
			{...handlers}
			href={href}
			prefetch={false}
			onPointerEnter={chain(handlers.onPointerEnter, () => onHover?.(true))}
			onPointerLeave={chain(handlers.onPointerLeave, () => onHover?.(false))}
			onFocus={chain(handlers.onFocus, () => onHover?.(true))}
			onBlur={chain(handlers.onBlur, () => onHover?.(false))}
			onClick={chain(handlers.onClick, morph)}
			{...dataAttributes}
			data-word={entry.slug}
			data-peek-state={status ?? undefined}
			data-recording-key={recordingKey}
			className={cn(
				"rounded-[3px] outline-none [-webkit-touch-callout:none]",
				"focus-visible:ring-1 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121012]",
				className
			)}
			style={style}
		>
			{children ?? entry.term}
		</Link>
	)
}

/** Runs both handlers in order; the second skips when the first prevented the default. */
function chain<E extends SyntheticEvent>(a: (e: E) => void, b: (e: E) => void) {
	return (e: E) => {
		a(e)
		if (!e.defaultPrevented) b(e)
	}
}
