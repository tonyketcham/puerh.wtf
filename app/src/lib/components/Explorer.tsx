"use client"

import SiteHeader from "./SiteHeader"
import FileTree from "./filetree/FileTree"
import type { SessionPreview } from "../types/session"
import type { Vendor } from "../types/vendor"
import type { Category } from "../types/category"
import Panel from "./containers/Panel"
import PanelSection from "@/lib/components/containers/PanelSection"

interface ExplorerProps {
	sessions: SessionPreview[]
	vendors: Vendor[]
	categories: Category[]
}

export default function Explorer({ sessions, vendors, categories }: ExplorerProps) {
	return (
		<div className="fixed inset-y-0 left-0 z-20 flex flex-col w-[340px] p-8 space-y-10 pointer-events-none font-fira-code">
			<SiteHeader />

			{/* The actual sidebar panel. Make this interactive. */}
			<Panel className="flex-1 contain-size" backdropClassName="bg-[rgba(45,40,45,0.35)]">
				<PanelSection title="Explorer">
					<FileTree
						data={[
							{ id: "sessions", title: "Sessions", children: sessions },
							{ id: "vendors", title: "Vendors", children: vendors },
							{ id: "categories", title: "Categories", children: categories },
						]}
					/>
				</PanelSection>
			</Panel>
		</div>
	)
}
