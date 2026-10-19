"use client"

import "./transitions.css"
import type { ReactNode } from "react"
import { useParams } from "next/navigation"
import { SessionPropertiesPanel } from "@/lib/components/SessionProperties"
import type { PageKind } from "@/lib/peek"
import { cn } from "@/lib/utils/cn"
import EntityProperties from "./EntityProperties"
import EntityStatusBar from "./EntityStatusBar"

/**
 * The editor frame for one kind's routes (/vendors, /vendors/[slug], …), mounted by each
 * route folder's layout so it persists while you move between entities of that kind: the
 * Properties radar morphs and the status bar slides instead of remounting.
 *
 * Entity pages get the Properties panel and an 8-column editor; index pages take the full
 * width. The page renders before the panel (see SetEntityPage).
 */
export default function EntityShell({ kind, children }: { kind: PageKind; children: ReactNode }) {
	const params = useParams<{ slug?: string }>()
	const slug = params?.slug ? decodeURIComponent(params.slug) : null

	return (
		// [data-statusbar-layout] turns on --statusbar-h (see app.css)
		<div className="flex-1 bg-background text-ink" data-statusbar-layout data-entity-shell={kind}>
			<div className="grid grid-cols-12 gap-x-8 gap-y-10 lg:gap-8 lg:p-8">
				<div className={cn("min-w-0", slug ? "col-span-12 lg:col-span-8" : "col-span-12")}>
					{children}
				</div>

				{slug && (
					<SessionPropertiesPanel>
						<EntityProperties kind={kind} slug={slug} />
					</SessionPropertiesPanel>
				)}
			</div>

			<EntityStatusBar kind={kind} slug={slug} />
		</div>
	)
}
