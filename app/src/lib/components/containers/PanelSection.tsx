import { cn } from "@/lib/utils"

interface PanelSectionProps {
	title: string
	children: React.ReactNode
	hasBottomBorder?: boolean
	hasPadding?: boolean
	rightSlot?: React.ReactNode
}

export default function PanelSection({
	title,
	children,
	hasBottomBorder = false,
	hasPadding = true,
	rightSlot,
}: PanelSectionProps) {
	return (
		<div className="relative">
			<div className="sticky top-0 p-0 border-b border-heicha-500">
				<div className="px-4 py-3 overflow-hidden backdrop-blur-xl bg-panel-header-bg ring-1 ring-heicha-500/10">
					<div className="flex items-center gap-2">
						<h2 className="text-sm font-medium text-white/80 flex-1">{title}</h2>
						{rightSlot}
					</div>
				</div>
			</div>
			<div className={cn(hasPadding && "p-4", hasBottomBorder && "border-b border-heicha-500")}>
				{children}
			</div>
		</div>
	)
}
