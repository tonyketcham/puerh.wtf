import { cn } from "@/lib/utils"
import SimpleBar from "simplebar-react"

interface PanelProps {
	children: React.ReactNode
	className?: string
	backdropClassName?: string
}

export default function Panel({ children, className, backdropClassName }: PanelProps) {
	return (
		<div
			className={cn("flex flex-col p-8 space-y-10 pointer-events-none font-fira-code", className)}
		>
			<div className="relative flex flex-col min-h-0 overflow-hidden border shadow-lg pointer-events-auto grow rounded-2xl border-heicha-500">
				<div className={cn("absolute inset-0 backdrop-blur-xl", backdropClassName)} />

				{/* Content Wrapper */}
				<div className="relative flex flex-col h-full">
					<SimpleBar
						style={{
							containerType: "size",
							height: "100cqh",
						}}
					>
						{children}
					</SimpleBar>
				</div>
			</div>
		</div>
	)
}
