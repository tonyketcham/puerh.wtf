"use client"

import "./transitions.css"
import type { ReactNode } from "react"
import { useParams } from "next/navigation"
import EditorFrame from "@/lib/components/containers/EditorFrame"
import type { PageKind } from "@/lib/peek"
import EntityProperties from "./EntityProperties"
import EntityStatusBar from "./EntityStatusBar"

/**
 * The editor frame for one kind's routes (/vendors, /vendors/[slug], …), mounted by each
 * route folder's layout so it persists while you move between entities of that kind: the
 * Properties radar morphs and the status bar slides instead of remounting.
 *
 * Entity pages get the Properties panel and a capped editor; index pages take the full
 * width (see EditorFrame). The page renders before the panel (see SetEntityPage).
 */
export default function EntityShell({ kind, children }: { kind: PageKind; children: ReactNode }) {
	const params = useParams<{ slug?: string }>()
	const slug = params?.slug ? decodeURIComponent(params.slug) : null

	return (
		// [data-statusbar-layout] turns on --statusbar-h (see app.css)
		<div className="flex-1 bg-background text-ink" data-statusbar-layout data-entity-shell={kind}>
			<EditorFrame panel={slug ? <EntityProperties kind={kind} slug={slug} /> : undefined}>
				{children}
			</EditorFrame>

			<EntityStatusBar kind={kind} slug={slug} />
		</div>
	)
}
