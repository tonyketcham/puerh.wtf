"use client"

import DetailsListItem from "@/lib/components/DetailsListItem"
import type { Cultivar } from "@/lib/types/session"
import "simplebar-react/dist/simplebar.min.css"
import PanelSection from "./containers/PanelSection"
import Panel from "./containers/Panel"
import type { PropsWithChildren } from "react"
import { useAtomValue } from "jotai"
import { sessionAtom } from "@/lib/store/sessionAtom"
import Chip from "@/lib/components/Chip"
import FlavorProfilePanel from "@/lib/components/properties/FlavorProfilePanel"
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

			<PanelSection title="Metadata">
				<ul className="space-y-4">
					<MetaData />
				</ul>
			</PanelSection>

			<NotesPanel />
		</>
	)
}

function MetaData() {
	const session = useAtomValue(sessionAtom)
	return (
		<>
			{session?.production_year && (
				<DetailsListItem icon={null} title="Production Year" value={session.production_year} />
			)}
			{session?.cultivar && <Cultivars values={session.cultivar} />}
		</>
	)
}

function Cultivars({ values }: { values: Cultivar[] }) {
	return (
		<>
			{values.map((value) => (
				<Chip key={value.id}>{value.title}</Chip>
			))}
		</>
	)
}
