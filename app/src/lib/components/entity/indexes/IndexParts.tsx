"use client"

import Link from "next/link"
import { useMemo, type ComponentProps, type MouseEvent, type ReactNode } from "react"
import { useAtomValue } from "jotai"
import { entityHref } from "@/lib/entities"
import type { PageKind } from "@/lib/peek"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import EntityTitle from "../page/EntityTitle"
import { liquorStops } from "../page/model"
import { useMorphClick } from "../page/viewTransition"

/**
 * Index page header: the collection's name in Rock 3D, filled with the liquors of every
 * session it covers (oldest vintage left), over a one-line `// summary`.
 */
export function IndexHeader({
	kind,
	title,
	summary,
	sessions,
	children,
}: {
	kind: PageKind
	title: string
	summary: ReactNode
	/** which sessions color the title; default every session */
	sessions?: "all"
	children?: ReactNode
}) {
	const index = useAtomValue(relationIndexAtom)
	const stops = useMemo(
		() => (sessions === "all" || !sessions ? liquorStops(index.sessions) : []),
		[index.sessions, sessions]
	)
	return (
		<header className="space-y-3">
			<EntityTitle
				kind={kind}
				slug="_index"
				title={title}
				stops={stops}
				recordingKey={`${kind}-index-title`}
			/>
			<p className="text-sm text-white/45">{summary}</p>
			{children}
		</header>
	)
}

/**
 * A link to an entity page that morphs its `[data-morph-title]` descendant (or itself) into
 * the page's title on the way there.
 */
export function EntityLink({
	kind,
	slug,
	onClick,
	...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { kind: PageKind; slug: string }) {
	const href = entityHref(kind, slug) ?? "#"
	const morph = useMorphClick(kind, slug, href, "[data-morph-title]")
	return (
		<Link
			{...rest}
			href={href}
			onClick={(e: MouseEvent<HTMLAnchorElement>) => {
				onClick?.(e)
				morph(e)
			}}
		/>
	)
}
