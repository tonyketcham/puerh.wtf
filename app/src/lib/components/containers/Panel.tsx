import { cn } from "@/lib/utils/cn"
import SimpleBar from "simplebar-react"

interface PanelProps {
	children: React.ReactNode
	className?: string
	header?: React.ReactNode
	id?: string
	backdropClassName?: string
}

export default function Panel({ children, className, header, id, backdropClassName }: PanelProps) {
	return (
		<div
			id={id}
			className={cn("flex flex-col space-y-10 pointer-events-none font-fira-code", className)}
		>
			<div className="relative flex flex-col min-h-0 overflow-hidden border shadow-lg pointer-events-auto grow rounded-2xl border-heicha-500">
				<div className={cn("absolute inset-0 backdrop-blur-xl bg-[#171617]", backdropClassName)} />

				{/* Content Wrapper */}
				<div className="relative flex flex-col h-full">
					{header && <div className="px-6 pt-6">{header}</div>}
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
