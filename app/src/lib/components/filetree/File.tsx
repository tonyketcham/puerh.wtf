"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { TreeNode } from "../../types/tree"

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
		<>
			<svg
				width="19"
				height="22"
				viewBox="0 0 19 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				className="mt-0.5 w-4 h-4 text-bai-cha-50 flex-shrink-0"
				style={{ color: node?.style?.[0]?.category?.color }}
			>
				<path
					d="M1.11322 3V19C1.11322 19.5304 1.3299 20.0391 1.71559 20.4142C2.10128 20.7893 2.62439 21 3.16984 21H15.5096C16.055 21 16.5781 20.7893 16.9638 20.4142C17.3495 20.0391 17.5662 19.5304 17.5662 19V7.342C17.5662 7.07556 17.5114 6.81181 17.4051 6.56624C17.2988 6.32068 17.1431 6.09824 16.9472 5.912L12.3815 1.57C11.9972 1.20466 11.4812 1.00007 10.9439 1H3.16984C2.62439 1 2.10128 1.21071 1.71559 1.58579C1.3299 1.96086 1.11322 2.46957 1.11322 3V3Z"
					stroke="currentColor"
					strokeWidth="1.25"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M6.25482 11H12.4247"
					stroke="white"
					strokeWidth="1.25"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M6.25482 16H9.33976"
					stroke="white"
					strokeWidth="1.25"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M11.3964 1.5V5C11.3964 5.53043 11.613 6.03914 11.9987 6.41421C12.3844 6.78929 12.9075 7 13.453 7H17"
					stroke="current"
					strokeWidth="1.25"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			<div className="inline my-auto font-normal">
				{node.production_year && (
					<span
						className={`${isCurrentPage ? "opacity-100" : "opacity-60"} group-hover:opacity-100`}
					>
						{node.production_year}
					</span>
				)}
				<span
					className={
						isCurrentPage
							? "opacity-100 text-tea-soup-500"
							: "opacity-60 group-hover:opacity-100 group-hover:text-tea-soup-500"
					}
				>
					{node.title}
				</span>
			</div>
		</>
	)

	const sharedClasses = "group px-4 py-1.5 text-left flex space-x-2 text-xs"
	const sharedStyle = { paddingLeft: `${indentationLevel * 1.5 + 0.375}rem` }
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
