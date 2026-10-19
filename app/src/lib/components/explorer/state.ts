/**
 * Explorer view state (plan §2.5): which activity-rail view is showing, which origin-tree
 * nodes are open, and which entity row is under the pointer.
 *
 * Module atoms so they survive switching views and navigating between pages. The view is
 * remembered per browser (a convenience: storage may be blocked, and "sessions" is fine).
 */
import { atom } from "jotai"
import type { EntityKind } from "@/lib/entities"

export const EXPLORER_VIEWS = ["sessions", "origins", "vendors", "styles"] as const
export type ExplorerView = typeof EXPLORER_VIEWS[number]

const isExplorerView = (v: unknown): v is ExplorerView =>
	typeof v === "string" && (EXPLORER_VIEWS as readonly string[]).includes(v)

const VIEW_KEY = "puerh:explorer-view"
const viewBaseAtom = atom<ExplorerView>("sessions")
viewBaseAtom.onMount = (set) => {
	try {
		const saved = window.localStorage.getItem(VIEW_KEY)
		if (isExplorerView(saved)) set(saved)
	} catch {}
}

export const explorerViewAtom = atom(
	(get) => get(viewBaseAtom),
	(_get, set, next: ExplorerView) => {
		set(viewBaseAtom, next)
		try {
			window.localStorage.setItem(VIEW_KEY, next)
		} catch {}
	}
)

/**
 * Origin-tree nodes the reader opened or closed by hand (slug → open). Nodes not in the map
 * fall back to the default: open down to the prefecture level.
 */
export const originTreeOpenAtom = atom<ReadonlyMap<string, boolean>>(new Map())

/** Styles view: categories closed by hand (open by default). */
export const styleGroupsClosedAtom = atom<ReadonlySet<string>>(new Set<string>())

export type ExplorerHover = { kind: EntityKind; slug: string }

/**
 * The entity row under the pointer or keyboard focus. The year ruler previews its vintages;
 * the origin map (Phase 5) lights its ring.
 */
export const explorerHoverAtom = atom<ExplorerHover | null>(null)
