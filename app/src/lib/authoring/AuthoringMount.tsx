"use client"
import dynamic from "next/dynamic"
import { useAtom } from "jotai"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { authoringBridgeAtom, readAuthoringActivation } from "./bridge"
const Runtime = dynamic(() => import("./runtime"), { ssr: false })
export default function AuthoringMount() {
	const [state, setState] = useAtom(authoringBridgeAtom),
		pathname = usePathname()
	useEffect(() => {
		if (
			readAuthoringActivation() ||
			pathname === "/write/" ||
			pathname === "/working-changes/" ||
			pathname === "/write" ||
			pathname === "/working-changes"
		)
			setState((s) => ({ ...s, activated: true }))
	}, [pathname, setState])
	return state.activated ? <Runtime /> : null
}
