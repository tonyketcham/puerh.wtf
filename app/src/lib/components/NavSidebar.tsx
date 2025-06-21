import SiteHeader from "./SiteHeader"
import Panel from "./containers/Panel"
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
			<Panel id="nav">
				<div className="flex justify-between space-x-2 place-items-center">
					<h2>Explorer</h2>
					{/* TODO: add search */}
				</div>
				<FileTree
					data={[
						{ id: "sessions", title: "Sessions", children: sessions },
						{ id: "vendors", title: "Vendors", children: vendors },
						{ id: "categories", title: "Categories", children: categories },
					]}
				/>
			</Panel>
		</div>
	)
}
