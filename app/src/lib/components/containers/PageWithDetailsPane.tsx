"use client"

import { useRef } from "react"
import Panel from "./Panel"

interface PageWithDetailsPaneProps {
	children: React.ReactNode
	details: React.ReactNode
}

export default function PageWithDetailsPane({ children, details }: PageWithDetailsPaneProps) {
	const siteRef = useRef<HTMLElement>(null)

	return (
		<>
			<main ref={siteRef} className="relative z-0 flex-1">
				{children}
			</main>
			<div className="fixed z-20 flex flex-col w-[340px] right-0 h-screen p-8 pointer-events-none">
				<Panel
					id="details"
					header={
						<div className="flex justify-between space-x-2 place-items-center">
							<h2>Details</h2>
							{/* TODO: add search */}
						</div>
					}
				>
					{details}
				</Panel>
			</div>
		</>
	)
}
