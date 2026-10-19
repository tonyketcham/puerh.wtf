"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo, type CSSProperties, type ReactNode } from "react"
import { ENTITY_META, entityHref, type EntityKind } from "@/lib/entities"
import { readFilters, replaceFilters, toggleFacet, type FacetKey } from "@/lib/filters"
import { isPageKind, type PageKind } from "@/lib/peek"
import { usePeekTrigger } from "@/lib/components/entity/peek/usePeekTrigger"
import { useMorphClick } from "@/lib/components/entity/page/viewTransition"
import { cn } from "@/lib/utils/cn"

export type EntityRefVariant = "chip" | "crumb"

export interface EntityRefProps {
	kind: EntityKind
	slug: string
	label: ReactNode
	/** tag / category / style color: tints the glyph (and a pressed filter chip) */
	color?: string | null
	/** sessions behind the entity, shown dim after the label */
	count?: number
	/** chip: a bordered token (property values); crumb: bare text (breadcrumbs) */
	variant?: EntityRefVariant
	/** crumb: the last segment (the session's own origin) */
	current?: boolean
	/** show the kind glyph (`^` origin, `@` vendor, `~` style, `%` cultivar, `#` tag, `:` vintage) */
	glyph?: boolean
	/**
	 * Page kinds open an EntityPeek on hover (250 ms), focus or long-press; ⌥-click or `p` pins
	 * it, ⇧↵ applies its Explorer filter. Default true.
	 */
	peek?: boolean
	/** native tooltip; defaults to "<label> · <kind>" (only used when there's no peek) */
	title?: string
	className?: string
	recordingKey?: string
}

/** Filter-only kinds and the Explorer facet each one toggles. */
const FILTER_FACET: Partial<Record<EntityKind, FacetKey>> = { tag: "tags", year: "years" }

/**
 * A reference to an entity, IDE "symbol" style: kind glyph + label (+ count).
 *
 * - Page kinds (origin, vendor, style, category, cultivar) link to their page (§2.3) and peek
 *   it first (EntityPeek, §3.1): Peek Definition before Go to Definition. Following the link
 *   morphs the ref into the page's title (a route view transition, see page/viewTransition).
 * - Filter kinds (tag, vintage) are toggle buttons for the Explorer's ?tags= / ?years= filter,
 *   pressed while that filter is on. Rendered under a Suspense boundary (they read the URL).
 */
export default function EntityRef(props: EntityRefProps) {
	const facet = FILTER_FACET[props.kind]
	return facet ? <FilterRef {...props} facet={facet} /> : <PageRef {...props} />
}

function PageRef({
	kind,
	slug,
	className,
	recordingKey,
	title,
	peek = true,
	...rest
}: EntityRefProps) {
	const href = entityHref(kind, slug) ?? "#"
	const meta = ENTITY_META[kind]
	const peekable = peek && isPageKind(kind)
	const target = useMemo(() => (peekable ? { kind, key: slug } : null), [peekable, kind, slug])
	const { handlers, status } = usePeekTrigger<HTMLAnchorElement>(target)
	const morph = useMorphClick(kind as PageKind, slug, isPageKind(kind) ? href : null)
	return (
		<Link
			{...handlers}
			onClick={(e) => {
				handlers.onClick(e)
				// Go to Definition: the ref grows into the page's title (route view transition)
				morph(e)
			}}
			href={href}
			prefetch={meta.routeReady ? undefined : false}
			// the peek says all of this and more; a native tooltip would only cover it
			title={peekable ? undefined : title ?? tooltip(rest.label, kind, rest.count)}
			data-entity-kind={kind}
			data-entity-slug={slug}
			data-recording-key={recordingKey}
			aria-current={rest.current ? "location" : undefined}
			className={cn(
				base(rest.variant),
				peekable && "[-webkit-touch-callout:none]",
				status && peekOpen(rest.variant),
				className
			)}
		>
			<Body kind={kind} {...rest} chevron={rest.variant !== "crumb"} />
		</Link>
	)
}

function FilterRef({
	kind,
	slug,
	facet,
	className,
	recordingKey,
	title,
	...rest
}: EntityRefProps & { facet: FacetKey }) {
	const params = useSearchParams()
	const pressed = readFilters(params).facets[facet].includes(slug)
	const color = rest.color ?? undefined
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={() => replaceFilters((current) => toggleFacet(current, facet, slug))}
			title={
				title ??
				`${pressed ? "Remove" : "Filter the Explorer by"} ${ENTITY_META[kind].label} “${
					typeof rest.label === "string" ? rest.label : slug
				}”`
			}
			data-entity-kind={kind}
			data-entity-slug={slug}
			data-recording-key={recordingKey}
			className={cn(
				base(rest.variant),
				pressed && "text-white ring-[var(--ref-color)] bg-[var(--ref-wash)]",
				className
			)}
			style={
				{
					"--ref-color": color ?? "rgb(255 255 255 / 0.4)",
					"--ref-wash": color
						? `color-mix(in oklab, ${color} 16%, transparent)`
						: "rgb(255 255 255 / 0.08)",
				} as CSSProperties
			}
		>
			<Body kind={kind} {...rest} chevron={false} />
		</button>
	)
}

function Body({
	kind,
	label,
	color,
	count,
	glyph = true,
	chevron,
}: Pick<EntityRefProps, "kind" | "label" | "color" | "count" | "glyph"> & { chevron: boolean }) {
	return (
		<>
			{glyph && (
				<span
					aria-hidden
					className="text-[0.9em] leading-none text-white/35 transition-colors group-hover/ref:text-white/60"
					style={color ? { color } : undefined}
				>
					{ENTITY_META[kind].glyph}
				</span>
			)}
			<span className="min-w-0 truncate">{label}</span>
			{count !== undefined && count > 1 && (
				<span className="tabular-nums text-white/30 transition-colors group-hover/ref:text-white/50">
					{count}
				</span>
			)}
			{chevron && (
				<span
					aria-hidden
					className="text-white/25 transition-[transform,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/ref:translate-x-0.5 group-hover/ref:text-white/60 group-focus-visible/ref:translate-x-0.5"
				>
					›
				</span>
			)}
		</>
	)
}

function base(variant: EntityRefVariant = "chip") {
	return cn(
		"group/ref inline-flex min-w-0 max-w-full items-center gap-1 align-middle font-fira-code outline-none",
		"transition-[color,background-color,box-shadow] duration-150",
		variant === "chip" && [
			"h-6 px-1.5 rounded-[4px] text-xs text-white/80",
			"ring-1 ring-inset ring-white/[0.08] bg-white/[0.025]",
			"hover:text-white hover:ring-white/20 hover:bg-white/[0.06]",
			"focus-visible:ring-white/50",
		],
		variant === "crumb" && [
			"rounded-sm text-white/45 hover:text-white",
			"focus-visible:ring-1 focus-visible:ring-white/40",
			"aria-[current=location]:text-white/90",
		]
	)
}

/** The trigger whose card is open reads as selected, like a symbol under Peek Definition. */
function peekOpen(variant: EntityRefVariant = "chip") {
	return variant === "chip"
		? "text-white ring-[#fff2ca]/30 bg-[#fff2ca]/[0.06]"
		: "text-white underline decoration-[#fff2ca]/30 underline-offset-4"
}

function tooltip(label: ReactNode, kind: EntityKind, count?: number) {
	const name = typeof label === "string" ? label : ""
	const sessions = count ? ` · ${count} ${count === 1 ? "session" : "sessions"}` : ""
	return `${name}${name ? " · " : ""}${ENTITY_META[kind].label}${sessions}`
}
