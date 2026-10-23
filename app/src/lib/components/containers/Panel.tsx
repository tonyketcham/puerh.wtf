import { cn } from "@/lib/utils/cn"
import SimpleBar from "simplebar-react"

interface PanelProps {
	children: React.ReactNode
	className?: string
	header?: React.ReactNode
	id?: string
	backdropClassName?: string
	/** Scroll down only: SimpleBar never turns on a horizontal axis, however far a child pokes out */
	verticalOnly?: boolean
}

export default function Panel({
	children,
	className,
	header,
	id,
	backdropClassName,
	verticalOnly,
}: PanelProps) {
	return (
		<div
			id={id}
			className={cn("flex flex-col space-y-10 pointer-events-none font-fira-code", className)}
		>
			{/* overlays raised from inside (the entity peek) dock against this box's outer edge */}
			{/* the edge is surface-plate's shadow stack, not a border: its outer hairline spreads 1px past
			    the 15px corner, so the face keeps the 15px inner radius the headers are concentric with */}
			<div
				data-overlay-panel
				className="relative flex flex-col min-h-0 overflow-hidden pointer-events-auto surface-plate grow rounded-[15px]"
			>
				<div
					className={cn(
						"absolute inset-0 backdrop-blur-xl surface-grain surface-face",
						backdropClassName
					)}
				/>

				{/* Content Wrapper */}
				<div className="relative flex flex-col h-full">
					{header && <div className="px-6 pt-6">{header}</div>}
					<SimpleBar
						style={{
							containerType: "size",
							height: "100cqh",
							// SimpleBar reads overflow-x: hidden off its root, then hides the x track and the
							// wrapper's x overflow itself
							...(verticalOnly && { overflowX: "hidden" }),
						}}
					>
						{children}
					</SimpleBar>
				</div>
				<div aria-hidden className="surface-tooth" />
			</div>
		</div>
	)
}
