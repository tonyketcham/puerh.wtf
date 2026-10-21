"use client"

import { useHydrateAtoms } from "jotai/utils"
import { useSetAtom } from "jotai"
import { useEffect } from "react"
import { explorerSessionsAtom } from "@/lib/store/sessionAtom"
import type { ExplorerSession } from "@/lib/types/session"

/**
 * Seeds explorerSessionsAtom from the root layout's server data. Hydrates synchronously on
 * first render (so lookups work during SSR + first paint) and re-syncs if the list changes
 * (e.g. HMR on content edits).
 */
export function HydrateExplorerSessions({ sessions }: { sessions: ExplorerSession[] }) {
	useHydrateAtoms([[explorerSessionsAtom, sessions]] as const)
	const setSessions = useSetAtom(explorerSessionsAtom)
	useEffect(() => {
		setSessions(sessions)
	}, [sessions, setSessions])
	return null
}
