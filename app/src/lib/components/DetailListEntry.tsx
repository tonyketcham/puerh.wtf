import React from "react"
import { cn } from "@/lib/utils"

interface DetailListEntryProps {
	label: string
	alignment?: "start" | "end"
	children: React.ReactNode
}

export default function DetailListEntry({
	label,
	alignment = "end",
	children,
}: DetailListEntryProps) {
	return (
		<li className="flex flex-row justify-between w-full space-y-2">
			<span className="font-fira-code text-brand">{label}</span>
			<div
				className={cn("flex items-center", alignment === "start" ? "justify-start" : "justify-end")}
			>
				{children}
			</div>
		</li>
	)
}
