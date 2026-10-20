"use client"

import { memo, useCallback, useMemo, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import Folder from "./Folder"
import File from "./File"
import VirtualList from "../explorer/VirtualList"
import { buildLink } from "../../utils/BuildLinkToGivenCollectionNode"
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

type Row = { key: string; depth: number } & (
	| { kind: "folder"; node: FileTreeFolder; open: boolean }
	| { kind: "file"; node: TreeNode; first: boolean; last: boolean }
	| { kind: "empty" }
)
const rowKey = (row: Row) => row.key
const rowClass = (row: Row) => (row.kind === "file" ? "ft-row" : undefined)

function FileTree({ data, referenceSlugs = null, order = "date" }: FileTreeProps) {
	const pathname = usePathname()
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
	const rows = useMemo(() => {
		const result: Row[] = []
		const walk = (node: FileTreeFolder, depth: number) => {
			const open = !closed.has(node.id)
			result.push({ kind: "folder", key: `folder:${node.id}`, depth, node, open })
			if (!open) return
			if (!node.children.length)
				result.push({ kind: "empty", key: `empty:${node.id}`, depth: depth + 1 })
			node.children.forEach((child, index) => {
				if (child.children)
					walk({ id: child.id, title: child.title, children: child.children }, depth + 1)
				else
					result.push({
						kind: "file",
						key: `file:${child.id}`,
						depth: depth + 1,
						node: child,
						first: index === 0,
						last: index === node.children.length - 1,
					})
			})
		}
		for (const node of data) walk(node, 0)
		return result
	}, [data, closed])
	const currentIndex = useMemo(() => {
		const path = pathname.replace(/\/+$/, "")
		const slug = path.split("/").at(-1)
		return rows.findIndex(
			(row) =>
				row.kind === "file" &&
				row.node._slug === slug &&
				buildLink(row.node).replace(/\/+$/, "") === path
		)
	}, [rows, pathname])
	const rowData = useCallback(
		(row: Row, index: number) =>
			row.kind === "file"
				? {
						"data-first": String(row.first),
						"data-last": String(row.last),
						"data-current-route": String(index < currentIndex),
				  }
				: {},
		[currentIndex]
	)
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
			<VirtualList
				items={rows}
				getKey={rowKey}
				rowHeight={(row) => (row.kind === "empty" ? 28 : 36)}
				label="Sessions"
				className="ft-list -mx-2 select-none"
				rowClassName={rowClass}
				rowData={rowData}
				renderRow={(row) =>
					row.kind === "folder" ? (
						<Folder
							title={row.node.title}
							nodes={row.node.children}
							total={row.node.total}
							actions={row.node.actions}
							expanded={row.open}
							indentationLevel={row.depth}
							onToggle={() =>
								setClosed((current) => {
									const next = new Set(current)
									if (row.open) next.add(row.node.id)
									else next.delete(row.node.id)
									return next
								})
							}
						/>
					) : row.kind === "empty" ? (
						<p
							className="py-2 text-[11px] text-white/35"
							style={{ paddingLeft: 26 + Math.max(0, row.depth - 1) * 12 }}
						>
							{"// nothing matches"}
						</p>
					) : (
						<File node={row.node} hrefFunction={buildLink} indentationLevel={row.depth} />
					)
				}
			/>
		</FileTreeContext.Provider>
	)
}

export default memo(FileTree)
