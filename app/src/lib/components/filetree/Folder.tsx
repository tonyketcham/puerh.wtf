"use client"

import { useState } from "react"
import File from "./File"
import type { TreeNode } from "../../types/tree"
import { buildLink } from "../../utils/BuildLinkToGivenCollectionNode"

interface FolderProps {
	title: string
	nodes: TreeNode[]
	expanded?: boolean
	indentationLevel?: number
}

export default function Folder({
	title,
	nodes,
	expanded: initialExpanded = true,
	indentationLevel = 0,
}: FolderProps) {
	const [expanded, setExpanded] = useState(initialExpanded)

	const toggle = () => {
		setExpanded(!expanded)
	}

	return (
		<>
			<div
				onClick={toggle}
				className="group p-1.5 text-left flex space-x-2 place-items-center cursor-pointer hover:bg-white/5 rounded-lg"
				style={{ paddingLeft: `${indentationLevel * 1.5 + 0.375}rem` }}
			>
				<svg
					width="6"
					height="6"
					viewBox="0 0 6 6"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					className={`w-2 h-2 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
				>
					<g opacity="0.4">
						<path d="M2 1L4 3L2 5" stroke="white" strokeLinecap="round" strokeLinejoin="round" />
					</g>
				</svg>

				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					className="flex-shrink-0 w-4 h-4 text-bai-cha-50"
				>
					<path
						d="M14.6666 12.6667V6C14.6666 5.64638 14.5262 5.30724 14.2761 5.05719C14.0261 4.80714 13.6869 4.66667 13.3333 4.66667H8.82398C8.57632 4.66666 8.33355 4.59767 8.1229 4.46744C7.91224 4.33721 7.74202 4.15088 7.63131 3.92933L7.03531 2.73733C6.92456 2.51569 6.75423 2.32929 6.54345 2.19905C6.33266 2.06881 6.08976 1.99988 5.84198 2H2.66665C2.31302 2 1.97389 2.14048 1.72384 2.39052C1.47379 2.64057 1.33331 2.97971 1.33331 3.33333V12.6667C1.33331 13.0203 1.47379 13.3594 1.72384 13.6095C1.97389 13.8595 2.31302 14 2.66665 14H13.3333C13.6869 14 14.0261 13.8595 14.2761 13.6095C14.5262 13.3594 14.6666 13.0203 14.6666 12.6667Z"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span className="font-normal opacity-60 group-hover:opacity-100 group-focus:opacity-100">
					{title}
				</span>
			</div>

			{expanded && (
				<ul className="transition-all duration-300">
					{nodes.map((node, index) => (
						<li key={index} className="rounded-lg hover:bg-white/5">
							{node?.children ? (
								<Folder
									title={node.title}
									nodes={node.children ?? []}
									indentationLevel={indentationLevel + 1}
								/>
							) : (
								<File
									node={node}
									hrefFunction={(node) => buildLink(node)}
									indentationLevel={indentationLevel + 1}
								/>
							)}
						</li>
					))}
				</ul>
			)}
		</>
	)
}
