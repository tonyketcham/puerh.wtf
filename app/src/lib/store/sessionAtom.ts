import { SessionFlavorAxes, type SessionFull, type SessionNotes } from "@/lib/types/session"
import { atom } from "jotai"

export const sessionAtom = atom<SessionFull | null>(null)

export const flavorAxesAtom = atom(
	(get) => get(sessionAtom)?.flavor_axes ?? null,
	(get, set, update: SessionFlavorAxes) => {
		const session = get(sessionAtom)
		if (session) {
			set(sessionAtom, { ...session, flavor_axes: update })
		}
	}
)

export const notesAtom = atom(
	(get) => get(sessionAtom)?.notes ?? null,
	(get, set, update: SessionNotes) => {
		const session = get(sessionAtom)
		if (session) {
			set(sessionAtom, { ...session, notes: update })
		}
	}
)
