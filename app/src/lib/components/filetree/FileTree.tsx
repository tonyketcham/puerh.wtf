"use client"

import { useMemo } from "react"
import Folder from "./Folder"
import type { TreeNode } from "../../types/tree"
import { FileTreeContext } from "./FileTreeContext"

export type FileTreeFolder = {
	id: string
	title: string
	children: TreeNode[]
	/** unfiltered size, shown as "n / total" while filtered */
	total?: number
}

interface FileTreeProps {
	data: FileTreeFolder[]
	/** descriptor "find references": session slugs that mention it (in display order), or null */
	referenceSlugs?: string[] | null
}

export default function FileTree({ data, referenceSlugs = null }: FileTreeProps) {
	const context = useMemo(
		() => ({
			referenceMatches: referenceSlugs
				? new Map(referenceSlugs.map((slug, i) => [slug, i] as const))
				: null,
		}),
		[referenceSlugs]
	)

	return (
		<FileTreeContext.Provider value={context}>
			<div className="flex flex-col select-none">
				{data.map((node) => (
					<Folder key={node.id} title={node.title} nodes={node.children} total={node.total} />
				))}
			</div>
		</FileTreeContext.Provider>
	)
}
