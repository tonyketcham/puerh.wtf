"use client"

import RadarChart from "@/lib/components/dataviz/radar/RadarChart"
import DetailsListItem from "@/lib/components/DetailsListItem"
import type { Cultivar, SessionFull, SessionNotes } from "@/lib/types/session"
import SimpleBar from "simplebar-react"
import "simplebar-react/dist/simplebar.min.css"
import PanelSection from "./containers/PanelSection"
import Panel from "./containers/Panel"
import type { PropsWithChildren } from "react"
import { useAtom, useAtomValue } from "jotai"
import { flavorAxesAtom, notesAtom, sessionAtom } from "@/lib/store/sessionAtom"
import Chip from "@/lib/components/Chip"

const noteDisplayConfig: Record<keyof SessionNotes, { title: string; icon: string }> = {
	dry_leaf_nose: {
		title: "Dry Leaf",
		icon: "🍃",
	},
	wet_leaf_nose: {
		title: "Wet Leaf",
		icon: "💧",
	},
	mouthfeel: {
		title: "Mouthfeel",
		icon: "👄",
	},
	taste: {
		title: "Taste",
		icon: "👅",
	},
	finish: {
		title: "Finish",
		icon: "🏁",
	},
	empty_cup: {
		title: "Empty Cup",
		icon: "🥣",
	},
	cha_qi: {
		title: "Cha Qi",
		icon: "✨",
	},
}

export function SessionPropertiesPanel({ children }: PropsWithChildren<unknown>) {
	return (
		<aside>
			<Panel className="fixed inset-y-0 right-0 w-[340px] h-full p-8">{children}</Panel>
		</aside>
	)
}

export default function SessionProperties() {
	return (
		<>
			<PanelSection title="Flavor Profile" hasBottomBorder hasPadding={false}>
				<FlavorProfile />
			</PanelSection>

			<PanelSection title="Metadata">
				<ul className="space-y-4">
					<MetaData />
				</ul>
			</PanelSection>

			<PanelSection title="Notes">
				<ul className="space-y-4">
					<Notes />
				</ul>
			</PanelSection>
		</>
	)
}

function FlavorProfile() {
	const flavorAxes = useAtomValue(flavorAxesAtom)

	return <RadarChart data={flavorAxes ?? {}} />
}

function Notes() {
	const notes = useAtomValue(notesAtom) ?? []

	return Object.entries(notes).map(([key, value]) => {
		if (!value) return null
		const config = noteDisplayConfig[key as keyof SessionNotes]
		if (!config) return null

		return <DetailsListItem key={key} icon={config.icon} title={config.title} value={value} />
	})
}

function MetaData() {
	const session = useAtomValue(sessionAtom)
	console.log({ session })
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
	return values.map((value) => (
		// <DetailsListItem key={value.id} icon={null} title="Cultivar" value={value.title} />
		<Chip key={value.id}>{value.title}</Chip>
	))
}
