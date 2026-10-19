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
 */
export function SessionPropertiesPanel({ children }: PropsWithChildren<unknown>) {
	return (
		<aside data-properties-panel>
			<Panel className="fixed top-0 right-0 bottom-[var(--statusbar-h)] w-[var(--properties-w)] p-8">
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
