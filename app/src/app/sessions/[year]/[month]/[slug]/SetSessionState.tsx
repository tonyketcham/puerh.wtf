"use client"

import { sessionAtom } from "@/lib/store/sessionAtom"
import { useSetAtom } from "jotai"
import { type SessionFull } from "@/lib/types/session"
import { useLayoutEffect } from "react"
import { liquorVars } from "@/lib/liquor"

/**
 * Syncs the page's session into the store. Runs as a layout effect, and is rendered first on
 * the page, so the per-page atom reset (triggered when the slug changes) happens before any
 * sibling component's effects measure/write steeps, runway, etc.
 *
 * Also publishes the liquor CSS vars on <html> so fixed chrome outside the page subtree
 * (properties panel, status bar, command bar, ::selection) can use var(--liquor*).
 */
function useSetSessionState({ session }: { session: SessionFull }) {
	const setSessionData = useSetAtom(sessionAtom)

	useLayoutEffect(() => {
		setSessionData(session)
	}, [session, setSessionData])

	useLayoutEffect(() => {
		const root = document.documentElement
		const vars = liquorVars(session._slug)
		for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
		return () => {
			for (const key of Object.keys(vars)) root.style.removeProperty(key)
		}
	}, [session._slug])
}

/**
 * To box this client logic within a client component, we need to wrap it in a no-op component.
 */
export function SetSessionState({ session }: { session: SessionFull }) {
	useSetSessionState({ session })
	return null
}
