import React from "react"

interface DetailsListItemProps {
	icon: React.ReactNode
	title: string
	value: React.ReactNode
}

export default function DetailsListItem({ icon, title, value }: DetailsListItemProps) {
	return (
		<li className="flex flex-col justify-between w-full space-y-2 text-xs">
			<div className="flex items-center space-x-2">
				<div>{icon}</div>
				<span className="font-fira-code text-brand">{title}</span>
			</div>
			<span className="text-ink-muted">{value}</span>
		</li>
	)
}
