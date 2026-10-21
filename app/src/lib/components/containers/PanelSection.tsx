import { cn } from "@/lib/utils/cn"

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
			<div className="sticky top-0 z-10 p-0 surface-strip">
				{/* concentric with the panel: a 5px inset puts a 22px control's 10px corner on the panel's
				    15px inner radius (15 − 5); a text slot steps in to the title's 16px gutter instead */}
				<div className="py-[5px] pl-4 pr-[5px] overflow-hidden backdrop-blur-xl bg-panel-header-bg surface-grain">
					<div className="flex items-center gap-2 h-[22px]">
						<h2 className="flex-1 text-xs font-medium text-white/95">{title}</h2>
						<div className="flex shrink-0 [&>span]:pr-[11px]">{rightSlot}</div>
					</div>
				</div>
			</div>
			<div className={cn(hasPadding && "p-4", hasBottomBorder && "border-b border-heicha-500")}>
				{children}
			</div>
		</div>
	)
}
