"use client"

import { sessionAtom } from "@/lib/store/sessionAtom"
import { useSetAtom } from "jotai"
import { type SessionFull } from "@/lib/types/session"
import { useEffect } from "react"

function useSetSessionState({ session }: { session: SessionFull }) {
	const setSessionData = useSetAtom(sessionAtom)

	useEffect(() => {
		setSessionData(session)
	}, [session])
}

/**
 * To box this client logic within a client component, we need to wrap it in a no-op component.
 */
export function SetSessionState({ session }: { session: SessionFull }) {
	useSetSessionState({ session })
	return null
}
