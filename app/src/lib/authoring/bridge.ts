"use client"
import { atom } from "jotai"
import type { Collection } from "./types"

const ACTIVATION_KEY = "puerh:editing"

/** This flag remembers explicit UI intent; the service still verifies GitHub access. */
export function readAuthoringActivation(): boolean {
	try {
		return localStorage.getItem(ACTIVATION_KEY) === "enabled"
	} catch {
		return false
	}
}
export function setAuthoringActivation(activated: boolean): void {
	try {
		if (activated) localStorage.setItem(ACTIVATION_KEY, "enabled")
		else localStorage.removeItem(ACTIVATION_KEY)
	} catch {
		// Site-data restrictions must not prevent reading or the current editing session.
	}
}

export type AuthoringRequest = {
	id: number
	action: "enable" | "disable" | "working" | "new" | "edit" | "session"
	collection?: Collection
	pathname?: string
	parentId?: string
	returnDraftId?: string
	returnField?: string
}
export const authoringBridgeAtom = atom({
	activated: false,
	enabled: false,
	count: 0,
	account: "",
	drafts: [] as {
		id: string
		title: string
		collection: Collection
		dirty: boolean
		prNumber?: number
	}[],
	request: null as AuthoringRequest | null,
})
export const requestAuthoringAtom = atom(
	null,
	(_get, set, request: Omit<AuthoringRequest, "id">) => {
		if (request.action === "enable") setAuthoringActivation(true)
		set(authoringBridgeAtom, (s) => ({
			...s,
			activated: true,
			request: { ...request, id: Date.now() + Math.random() },
		}))
	}
)
