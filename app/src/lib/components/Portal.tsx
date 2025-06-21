"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

interface PortalProps {
	children: React.ReactNode
}

export default function Portal({ children }: PortalProps) {
	const [mounted, setMounted] = useState(false)
	const [portalContainer, setPortalContainer] = useState<Element | null>(null)

	useEffect(() => {
		setMounted(true)
		setPortalContainer(document.getElementById("portal-root"))
	}, [])

	return mounted && portalContainer ? createPortal(children, portalContainer) : null
}
