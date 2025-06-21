"use client"

import { useRef, useState } from "react"

interface PanelProps {
	id?: string
	children: React.ReactNode
	header?: React.ReactNode
}

export default function Panel({ id = "", children, header }: PanelProps) {
	const [isDragging, setIsDragging] = useState(false)
	const [offset, setOffset] = useState({ x: 0, y: 0 })
	const handleRef = useRef<HTMLDivElement>(null)

	const handleMouseDown = () => {
		setIsDragging(true)
	}

	const handleMouseUp = () => {
		setIsDragging(false)
	}

	const handleDoubleClick = () => {
		setOffset({ x: 0, y: 0 })
	}

	return (
		<section
			id={id}
			className={`flex flex-col w-full flex-grow overflow-hidden h-full rounded-2xl border border-heicha-500 box-border bg-heicha-700 backdrop-brightness-50 backdrop-blur-[48px] transition-opacity duration-200 ease-in-out ${
				isDragging ? "bg-opacity-80 border-white/30" : "bg-opacity-40"
			}`}
			style={{
				boxShadow: "0px 8px 14px rgba(0, 0, 0, 0.1)",
				transform: `translate(${offset.x}px, ${offset.y}px)`,
			}}
		>
			{header && (
				<div
					ref={handleRef}
					className={`bg-heicha-600/5 py-3 px-4 border-b cursor-grab pointer-events-auto ${
						isDragging ? "cursor-grabbing border-white/30" : "cursor-grab border-heicha-500"
					}`}
					onMouseDown={handleMouseDown}
					onMouseUp={handleMouseUp}
					onDoubleClick={handleDoubleClick}
				>
					{header}
				</div>
			)}
			<div
				className="max-h-full pointer-events-auto overscroll-y-auto"
				style={{ overflowY: "auto" }}
			>
				{children}
			</div>
		</section>
	)
}
