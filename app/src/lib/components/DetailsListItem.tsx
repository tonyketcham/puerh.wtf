import React from "react"

interface DetailsListItemProps {
	icon: React.ReactNode
	title: string
	value: string
	alignment?: "center" | "start" | "end"
	flexDirection?: "row" | "col"
}

export default function DetailsListItem({
	icon,
	title,
	value,
	alignment = "center",
	flexDirection = "row",
}: DetailsListItemProps) {
	return (
		<li
			className={`flex flex-${flexDirection} justify-between w-full space-x-2 place-items-${alignment}`}
		>
			<div className="flex items-center space-x-2">
				{icon}
				<span className="font-fira-code text-brand">{title}</span>
			</div>
			<span className="text-ink-muted">{value}</span>
		</li>
	)
}
