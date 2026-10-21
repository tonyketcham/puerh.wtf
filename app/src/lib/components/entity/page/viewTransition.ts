"use client"

/**
 * Route morphs into an entity page (plan §3.2 Motion): the clicked chip, crumb or peek header
 * grows into the page's Rock 3D title; everything else cross-fades.
 *
 * Why not React's <ViewTransition>: with Next 16's App Router the new page reaches the DOM in
 * a commit React doesn't consider for view transitions (no transition ever starts on a Link
 * navigation, verified on the static export), while a Suspense reveal on first load *does*
 * start one: a whole-page cross-fade on every hard load. So the morph drives the View
 * Transitions API itself, the way next-view-transitions does:
 *
 * 1. on a plain click, the source borrows the destination title's view-transition-name
 * 2. document.startViewTransition snapshots the old page, and its update callback pushes the
 *    route and waits
 * 3. the new title's layout effect (EntityTitle) clears the borrowed name and resolves the
 *    wait, so the new snapshot pairs the title with the source and the browser morphs it
 *
 * Browsers without the API just navigate. Reduced motion keeps the cross-fade and drops the
 * morph (transitions.css).
 */
import { useRouter } from "next/navigation"
import { useCallback, type MouseEvent } from "react"
import type { PageKind } from "@/lib/peek"

const SOURCE_ATTR = "data-vt-source"
/** view-transition-class shared by the title morph (timing lives in transitions.css) */
export const TITLE_CLASS = "entity-title"
/** give up on a page that never mounts a title (a 404, a slow network) and let it swap */
const MOUNT_TIMEOUT_MS = 2500

type Pending = { name: string; resolve: () => void }
let pending: Pending | null = null

/** What a title can belong to: an entity page, or a word of the flavor lexicon (/lexicon/[slug]). */
export type MorphKind = PageKind | "descriptor"

/**
 * A second pair that may ride along with the title: an element on the old page that grows
 * into one on the new page (the origin map inset → the origin page's hero map). The new page's
 * element carries the name itself; the source borrows it for the snapshot like the title does.
 */
export type MorphCompanion = { el: Element | null | undefined; name: string; className: string }

/** view-transition-class of the origin map morph (timing lives in map/map.css) */
export const ORIGIN_MAP_CLASS = "origin-map"

/** The view-transition-name of an origin's map (inset in Properties or a peek → page hero). */
export function originMapTransitionName(slug: string): string {
	return `origin-map-${slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

/** A valid CSS <custom-ident> for an entity's title. */
export function titleTransitionName(kind: MorphKind, slug: string): string {
	return `entity-${kind}-${slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

/** Clear borrowed names (the source may stay mounted, e.g. a Properties chip). */
export function clearMorphSources() {
	if (typeof document === "undefined") return
	for (const el of document.querySelectorAll<HTMLElement | SVGElement>(`[${SOURCE_ATTR}]`)) {
		el.style.removeProperty("view-transition-name")
		el.style.removeProperty("view-transition-class")
		el.removeAttribute(SOURCE_ATTR)
	}
}

/** Called by EntityTitle when it mounts: the new page is in the DOM, take the new snapshot. */
export function titleMounted(kind: MorphKind, slug: string) {
	clearMorphSources()
	if (pending && pending.name === titleTransitionName(kind, slug)) {
		pending.resolve()
		pending = null
	}
}

/** A plain primary click (new-tab and modified clicks keep the browser's behavior). */
export function isPlainClick(e: {
	button: number
	metaKey: boolean
	ctrlKey: boolean
	shiftKey: boolean
	altKey: boolean
}) {
	return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

type Router = ReturnType<typeof useRouter>

/**
 * Navigate to an entity page, morphing `source` into its title. Returns false (and does
 * nothing) when the browser can't, so the caller lets its link navigate normally.
 */
export function navigateWithMorph(
	router: Router,
	href: string,
	source: Element | null | undefined,
	kind: MorphKind,
	slug: string,
	companions: MorphCompanion[] = []
): boolean {
	if (typeof document === "undefined" || !("startViewTransition" in document)) return false
	if (`${location.pathname}` === href) return false
	const name = titleTransitionName(kind, slug)
	clearMorphSources()
	pending?.resolve()
	if (source instanceof HTMLElement) {
		source.style.setProperty("view-transition-name", name)
		source.style.setProperty("view-transition-class", TITLE_CLASS)
		source.setAttribute(SOURCE_ATTR, "")
	}
	for (const c of companions) {
		if (!(c.el instanceof HTMLElement || c.el instanceof SVGElement)) continue
		c.el.style.setProperty("view-transition-name", c.name)
		c.el.style.setProperty("view-transition-class", c.className)
		c.el.setAttribute(SOURCE_ATTR, "")
	}
	const transition = document.startViewTransition(
		() =>
			new Promise<void>((resolve) => {
				const done = () => {
					window.clearTimeout(timer)
					resolve()
				}
				const timer = window.setTimeout(() => {
					clearMorphSources()
					done()
				}, MOUNT_TIMEOUT_MS)
				pending = { name, resolve: done }
				router.push(href)
			})
	)
	transition.finished.finally(clearMorphSources).catch(() => {})
	return true
}

/**
 * onClick for a link into an entity page: on a plain click, prevent the link's own
 * navigation and morph instead. The morphing element defaults to the clicked one; pass a
 * selector (a descendant, like a card's name) or a function to pick another.
 */
export function useMorphClick(
	kind: MorphKind,
	slug: string,
	href: string | null,
	source?: string | ((el: HTMLElement) => Element | null | undefined)
) {
	const router = useRouter()
	return useCallback(
		(e: MouseEvent<HTMLElement>) => {
			if (!href || e.defaultPrevented || !isPlainClick(e)) return
			const el = e.currentTarget
			const picked =
				typeof source === "function" ? source(el) : source ? el.querySelector(source) : null
			if (navigateWithMorph(router, href, picked ?? el, kind, slug)) e.preventDefault()
		},
		[router, href, kind, slug, source]
	)
}
