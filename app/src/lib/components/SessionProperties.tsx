"use client"

import "simplebar-react/dist/simplebar.min.css"
import Panel from "./containers/Panel"
import type { PropsWithChildren } from "react"
import FlavorProfilePanel from "@/lib/components/properties/FlavorProfilePanel"
import ProvenancePanels from "@/lib/components/properties/ProvenancePanels"
import NotesPanel from "@/lib/components/properties/NotesPanel"

/**
 * Fixed right "Properties" panel. Sits above the status bar (bottom inset = --statusbar-h)
 * and exposes [data-properties-panel] so :root can publish --rightpanel-w for centering
 * the command bar over the editor column.
 *
 * Below lg it joins the page flow under the editor as a full-width, height-capped card; the
 * size container gives the panel's scroller (100cqh) that cap to fill.
 */
export function SessionPropertiesPanel({ children }: PropsWithChildren<unknown>) {
	return (
		<aside data-properties-panel className="min-w-0 col-span-12 lg:col-span-4">
			<Panel className="relative h-[min(46rem,85svh)] [container-type:size] lg:[container-type:normal] lg:h-auto lg:fixed lg:top-0 lg:right-0 lg:bottom-[var(--statusbar-h)] lg:w-[var(--properties-w)] lg:p-8">
				{children}
			</Panel>
		</aside>
	)
}

export default function SessionProperties() {
	return (
		<>
			<FlavorProfilePanel />

			{/* Provenance / Source / Record (plan §3.4) */}
			<ProvenancePanels />

			<NotesPanel />
		</>
	)
}
