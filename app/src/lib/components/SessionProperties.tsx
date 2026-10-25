"use client"

import FlavorProfilePanel from "@/lib/components/properties/FlavorProfilePanel"
import ProvenancePanels from "@/lib/components/properties/ProvenancePanels"
import NotesPanel from "@/lib/components/properties/NotesPanel"

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
