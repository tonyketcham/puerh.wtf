"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useAtom, useAtomValue } from "jotai"
import { isEntityFiltered } from "@/lib/filters"
import { entityHref } from "@/lib/entities"
import { sessionColor, type EntityNode } from "@/lib/relations"
import Hatch from "@/lib/components/entity/Hatch"
import { cn } from "@/lib/utils"
import EntityRow from "./EntityRow"
import { OriginMark } from "./marks"
import ViewHeader from "./ViewHeader"
import { explorerHoverAtom, originTreeOpenAtom } from "./state"
import { countBy, stripSlash, type EntityViewProps } from "./views"

const ROW_SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } as const

/** Unless opened or closed by hand, the tree starts open down to the counties (… › Mengla › Yiwu). */
const DEFAULT_OPEN_DEPTH = 4

type Row = { node: EntityNode; depth: number; ancestors: string[]; hasChildren: boolean }

/**
 * Origins as a collapsible tree, country → village, each node counting its own sessions and
 * every descendant's (Yiwu 11). The marker is the map's: precision in the center, one liquor
 * ring per session that names the place itself. "Show on map" opens the origins map.
 */
export default function OriginsView({
	index,
	pool,
	filters,
	narrowed,
	pathname,
	onToggleFilter,
}: EntityViewProps) {
	const reduce = useReducedMotion()
	const [openMap, setOpenMap] = useAtom(originTreeOpenAtom)
	const hover = useAtomValue(explorerHoverAtom)
	const hovered = hover?.kind === "origin" ? hover.slug : null

	const nodes = index.nodes.origin
	const children = index.children.origin
	const counts = useMemo(() => countBy(pool, "origin"), [pool])
	const direct = useMemo(() => countBy(pool, "origin", { rollup: false }), [pool])

	// the origin page being viewed keeps its branch open
	const currentSlug = useMemo(() => {
		const m = /^\/origins\/([^/]+)$/.exec(pathname)
		return m ? decodeURIComponent(m[1]) : null
	}, [pathname])
	const currentAncestors = useMemo(() => {
		const out = new Set<string>()
		let node = currentSlug ? nodes.get(currentSlug) : undefined
		while (node?.parent && !out.has(node.parent)) {
			out.add(node.parent)
			node = nodes.get(node.parent)
		}
		return out
	}, [currentSlug, nodes])

	const isOpen = useCallback(
		(slug: string, depth: number) =>
			openMap.get(slug) ?? (narrowed || depth < DEFAULT_OPEN_DEPTH || currentAncestors.has(slug)),
		[openMap, narrowed, currentAncestors]
	)

	const byCount = useCallback(
		(a: string, b: string) =>
			(counts.get(b)?.length ?? 0) - (counts.get(a)?.length ?? 0) ||
			(nodes.get(a)?.title ?? a).localeCompare(nodes.get(b)?.title ?? b),
		[counts, nodes]
	)

	const { rows, places } = useMemo(() => {
		const rows: Row[] = []
		const roots = [...nodes.values()].filter((n) => !n.parent).map((n) => n.slug)
		// a filtered origin stays listed (with its branch) even when nothing else passes, so it
		// can be turned off where it was turned on
		const kept = new Set<string>()
		for (const node of nodes.values()) {
			if (!isEntityFiltered(filters, "origin", node.slug, node.id)) continue
			for (
				let n: typeof node | undefined = node;
				n && !kept.has(n.slug);
				n = n.parent ? nodes.get(n.parent) : undefined
			)
				kept.add(n.slug)
		}
		const visible = (slug: string) => (counts.get(slug)?.length ?? 0) > 0 || kept.has(slug)
		let places = 0
		const walk = (slug: string, depth: number, ancestors: string[]) => {
			const node = nodes.get(slug)
			if (!node || !visible(slug)) return
			places++
			const kids = (children.get(slug) ?? []).filter(visible).sort(byCount)
			rows.push({ node, depth, ancestors, hasChildren: kids.length > 0 })
			if (kids.length && isOpen(slug, depth)) {
				for (const kid of kids) walk(kid, depth + 1, [...ancestors, slug])
			} else {
				// count the closed branch's places too, so the header doesn't shrink as you fold
				const stack = [...kids]
				while (stack.length) {
					const k = stack.pop()!
					places++
					stack.push(...(children.get(k) ?? []).filter(visible))
				}
			}
		}
		for (const root of roots.filter(visible).sort(byCount)) walk(root, 0, [])
		return { rows, places }
	}, [nodes, children, counts, byCount, isOpen, filters])

	const onOpenChange = useCallback(
		(slug: string, open: boolean) =>
			setOpenMap((m) => {
				const next = new Map(m)
				next.set(slug, open)
				return next
			}),
		[setOpenMap]
	)

	const unplaced = useMemo(() => pool.filter((s) => !s.origin?.length).length, [pool])

	const rowMotion = reduce
		? {
				initial: { opacity: 0 },
				animate: { opacity: 1 },
				exit: { opacity: 0 },
				transition: { duration: 0.12 },
		  }
		: {
				initial: { opacity: 0, height: 0, overflow: "hidden" },
				animate: { opacity: 1, height: "auto", transitionEnd: { overflow: "visible" } },
				exit: { opacity: 0, height: 0, overflow: "hidden" },
				transition: { height: ROW_SPRING, layout: ROW_SPRING, opacity: { duration: 0.18 } },
		  }

	return (
		<div data-explorer-view="origins">
			<ViewHeader label="Origins" count={places} noun={places === 1 ? "place" : "places"}>
				<ShowOnMap pathname={pathname} />
			</ViewHeader>
			<ul aria-label="Origins">
				<AnimatePresence initial={false}>
					{rows.map(({ node, depth, ancestors, hasChildren }, i) => {
						const k = hovered ? ancestors.indexOf(hovered) : -1
						const own = direct.get(node.slug) ?? []
						return (
							<motion.li key={node.slug} layout="position" {...rowMotion}>
								<EntityRow
									kind="origin"
									slug={node.slug}
									title={node.title}
									sub={node.hanzi || undefined}
									count={counts.get(node.slug)?.length ?? 0}
									total={node.all.length}
									mark={
										<OriginMark kind={node.originKind} colors={own.map(sessionColor)} index={i} />
									}
									depth={depth}
									litGuides={k >= 0 ? [k] : null}
									expandable={hasChildren}
									open={hasChildren && isOpen(node.slug, depth)}
									onOpenChange={onOpenChange}
									parentSlug={node.parent}
									filtered={isEntityFiltered(filters, "origin", node.slug, node.id)}
									onToggleFilter={onToggleFilter}
									current={pathname === stripSlash(entityHref("origin", node.slug) ?? "")}
									recordingKey={`explorer-origin-${node.slug}`}
								/>
							</motion.li>
						)
					})}
				</AnimatePresence>
				{rows.length === 0 && (
					<li className="px-2 py-1.5 text-xs text-white/35">nothing matches</li>
				)}
			</ul>
			{unplaced > 0 && <Unplaced count={unplaced} />}
		</div>
	)
}

/**
 * "Show on map": the origins map is the tree's other face. Pressed while the map page is
 * open; pressing it again goes back to where you were.
 */
function ShowOnMap({ pathname }: { pathname: string }) {
	const router = useRouter()
	const onMap = pathname === "/origins"
	const className = cn(
		"group/map flex items-center gap-1.5 h-5 pl-1 pr-1.5 rounded-sm text-[10px] leading-none",
		"transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/25",
		onMap
			? "text-brand/90 bg-brand/[0.08]"
			: "text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
	)
	const body = (
		<>
			<span
				aria-hidden
				className={cn(
					"relative flex items-center w-5 h-3 rounded-full border transition-colors",
					onMap ? "border-brand/50 bg-brand/15" : "border-white/20"
				)}
			>
				<motion.span
					className={cn("absolute size-1.5 rounded-full", onMap ? "bg-brand" : "bg-white/50")}
					initial={false}
					animate={{ left: onMap ? 10 : 2 }}
					transition={{ type: "spring", stiffness: 600, damping: 32 }}
				/>
			</span>
			map
		</>
	)
	if (onMap) {
		return (
			<button
				type="button"
				role="switch"
				aria-checked
				aria-label="Show on map"
				title="Back from the map"
				onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
				className={className}
			>
				{body}
			</button>
		)
	}
	return (
		<Link
			href="/origins/"
			prefetch={false}
			role="switch"
			aria-checked={false}
			aria-label="Show on map"
			title="Show on map"
			className={className}
		>
			{body}
		</Link>
	)
}

/** Sessions with no recorded origin: blends, undisclosed gardens. Terra incognita, honestly marked. */
function Unplaced({ count }: { count: number }) {
	return (
		<div
			className="relative flex items-center gap-2 px-2 py-1.5 mt-2 overflow-hidden rounded-md text-[11px] text-white/40"
			title="Sessions with no recorded origin: blends and undisclosed gardens"
		>
			<Hatch className="absolute inset-0 w-full h-full opacity-70" />
			<span className="relative grid size-4 place-items-center text-white/40" aria-hidden>
				∅
			</span>
			<span className="relative flex-1">unplaced · blends &amp; undisclosed</span>
			<span className="relative pr-2 tabular-nums">{count}</span>
		</div>
	)
}
