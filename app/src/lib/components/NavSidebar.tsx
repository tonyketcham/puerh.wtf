"use client"

import SiteHeader from "./SiteHeader"
import FileTree from "./filetree/FileTree"
import type { SessionPreview } from "../types/session"
import type { Vendor } from "../types/vendor"
import type { Category } from "../types/category"
import SimpleBar from "simplebar-react"
import "simplebar-react/dist/simplebar.min.css"

interface NavSidebarProps {
	sessions: SessionPreview[]
	vendors: Vendor[]
	categories: Category[]
}

export default function NavSidebar({ sessions, vendors, categories }: NavSidebarProps) {
	return (
		<div className="fixed inset-y-0 left-0 z-20 flex flex-col w-[340px] h-full p-8 space-y-10 pointer-events-none font-fira-code">
			<SiteHeader />

			{/* The actual sidebar panel. Make this interactive. */}
			<div className="relative flex flex-col grow min-h-0 overflow-hidden border shadow-lg pointer-events-auto rounded-2xl border-heicha-500">
				{/* Background Element */}
				<div className="absolute inset-0 bg-[rgba(45,40,45,0.35)] backdrop-blur-xl" />

				{/* Content Wrapper */}
				<div className="relative z-10 flex flex-col h-full">
					{/* Header */}
					<div className="px-4 py-3 border-b border-heicha-500 bg-panel-header-bg">
						<h2 className="text-sm font-medium text-white/80">Explorer</h2>
						{/* TODO: add search */}
					</div>

					{/* FileTree container */}
					<SimpleBar
						style={{
							containerType: "size",
							height: "100cqh",
						}}
					>
						<div className="p-2">
							<FileTree
								data={[
									{ id: "sessions", title: "Sessions", children: sessions },
									{ id: "vendors", title: "Vendors", children: vendors },
									{ id: "categories", title: "Categories", children: categories },
								]}
							/>
						</div>
					</SimpleBar>
				</div>
			</div>
		</div>
	)
}
