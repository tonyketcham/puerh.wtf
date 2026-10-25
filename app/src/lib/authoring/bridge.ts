"use client"
import { atom } from "jotai"
import type { Collection } from "./types"

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
		set(authoringBridgeAtom, (s) => ({
			...s,
			activated: true,
			request: { ...request, id: Date.now() + Math.random() },
		}))
	}
)
