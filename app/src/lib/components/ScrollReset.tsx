"use client"

import { usePathname } from "next/navigation"
import { useEffect, useLayoutEffect, useRef } from "react"

/**
 * A new page opens at its top. Next scrolls a changed segment into view only when it judges
 * the segment out of view, and on phones that has let a session open at the depth the home
 * page was scrolled to; this makes the reset explicit. Back/forward (popstate) and #hash
 * links keep the browser's own restoration, and query-only changes (filters) don't move.
 */
export default function ScrollReset() {
	const pathname = usePathname()
	const popRef = useRef(false)
	const firstRef = useRef(true)

	useEffect(() => {
		const onPop = () => {
			popRef.current = true
		}
		window.addEventListener("popstate", onPop)
		return () => window.removeEventListener("popstate", onPop)
	}, [])

	useLayoutEffect(() => {
		if (firstRef.current) {
			firstRef.current = false
			return
		}
		const pop = popRef.current
		popRef.current = false
		if (pop || location.hash) return
		window.scrollTo({ top: 0, left: 0, behavior: "instant" })
	}, [pathname])

	return null
}
