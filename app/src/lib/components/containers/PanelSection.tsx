interface PanelSectionProps {
	title: string
	children: React.ReactNode
	hasBottomBorder?: boolean
}

export default function PanelSection({
	title,
	children,
	hasBottomBorder = false,
}: PanelSectionProps) {
	return (
		<div className="relative">
			<div className="sticky top-0 p-0 border-b border-heicha-500">
				<div className="px-4 py-3 overflow-hidden backdrop-blur-xl bg-panel-header-bg ring-1 ring-heicha-500/10">
					<h2 className="text-sm font-medium text-white/80">{title}</h2>
				</div>
			</div>
			<div className={`p-4 ${hasBottomBorder ? "border-b border-heicha-500" : ""}`}>{children}</div>
		</div>
	)
}
