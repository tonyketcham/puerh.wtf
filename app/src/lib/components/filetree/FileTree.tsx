"use client"

import { useMemo, type ReactNode } from "react"
import Folder from "./Folder"
import type { TreeNode } from "../../types/tree"
import { FileTreeContext } from "./FileTreeContext"

export type FileTreeFolder = {
	id: string
	title: string
	children: TreeNode[]
	/** unfiltered size, shown as "n / total" while filtered */
	total?: number
	/** header actions at the right of the folder row (e.g. the sessions sort) */
	actions?: ReactNode
}

interface FileTreeProps {
	data: FileTreeFolder[]
	/** descriptor "find references": session slugs that mention it (in display order), or null */
	referenceSlugs?: string[] | null
	/** current sort of the rows (see FileTreeContextValue.order) */
	order?: string
}

export default function FileTree({ data, referenceSlugs = null, order = "date" }: FileTreeProps) {
	const context = useMemo(
		() => ({
			referenceMatches: referenceSlugs
				? new Map(referenceSlugs.map((slug, i) => [slug, i] as const))
				: null,
			order,
		}),
		[referenceSlugs, order]
	)

	return (
		<FileTreeContext.Provider value={context}>
			{/* rows run a little wider than the panel padding, like the entity views: names need the room */}
			<div className="flex flex-col -mx-2 select-none">
				{data.map((node) => (
					<Folder
						key={node.id}
						title={node.title}
						nodes={node.children}
						total={node.total}
						actions={node.actions}
					/>
				))}
			</div>
		</FileTreeContext.Provider>
	)
}
