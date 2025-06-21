import SiteHeader from "./SiteHeader"
import FileTree from "./filetree/FileTree"
import type { SessionPreview } from "../types/session"
import type { Vendor } from "../types/vendor"
import type { Category } from "../types/category"

interface NavSidebarProps {
	sessions: SessionPreview[]
	vendors: Vendor[]
	categories: Category[]
}

export default function NavSidebar({ sessions, vendors, categories }: NavSidebarProps) {
	return (
		<div className="fixed z-20 flex flex-col w-[340px] h-screen p-8 space-y-10 pointer-events-none">
			<SiteHeader />

			{/* The actual sidebar panel. Make this interactive. */}
			<div className="relative flex flex-col flex-grow pointer-events-auto">
				{/* Background Element */}
				<div className="absolute inset-0 bg-[rgba(45,40,45,0.35)] backdrop-blur-xl rounded-2xl border border-white/5 shadow-lg" />

				{/* Content Wrapper */}
				<div className="relative z-10 flex flex-col h-full">
					{/* Header */}
					<div className="px-4 py-3 border-b border-white/5">
						<h2 className="text-sm font-medium text-white/80">Explorer</h2>
						{/* TODO: add search */}
					</div>

					{/* FileTree container */}
					<div className="flex-grow p-2 overflow-y-auto">
						<FileTree
							data={[
								{ id: "sessions", title: "Sessions", children: sessions },
								{ id: "vendors", title: "Vendors", children: vendors },
								{ id: "categories", title: "Categories", children: categories },
							]}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
