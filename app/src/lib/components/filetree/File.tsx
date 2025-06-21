"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { TreeNode } from "../../types/tree"
import ColoredFileIcon from "./ColoredFileIcon"

interface FileProps {
	node: TreeNode
	hrefFunction: ((node: TreeNode) => string) | null
	indentationLevel?: number
}

export default function File({ node, hrefFunction, indentationLevel = 0 }: FileProps) {
	const pathname = usePathname()
	const hasHref = !!hrefFunction
	const href = hasHref && hrefFunction ? hrefFunction(node) : "#"
	const isCurrentPage = hasHref && pathname === href

	const content = (
		<div className="flex items-center space-x-2">
			<ColoredFileIcon color={node?.style?.[0]?.category?.color} />
			<div className="inline my-auto font-normal text-white/60 group-hover:text-white">
				{node.production_year && <span className="text-[#fff2ca]">{node.production_year}</span>}
				<span className={isCurrentPage ? "text-white" : ""}>{` ${node.title}`}</span>
			</div>
		</div>
	)

	const sharedClasses = "group px-2 py-1.5 text-left flex space-x-2 text-sm"
	const sharedStyle = { paddingLeft: `${indentationLevel * 1.25}rem` }
	if (hasHref) {
		return (
			<Link href={href} className={sharedClasses} style={sharedStyle}>
				{content}
			</Link>
		)
	}

	return (
		<div className={sharedClasses} style={sharedStyle}>
			{content}
		</div>
	)
}
