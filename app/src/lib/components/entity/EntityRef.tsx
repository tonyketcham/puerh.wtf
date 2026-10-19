"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { CSSProperties, ReactNode } from "react"
import { ENTITY_META, entityHref, type EntityKind } from "@/lib/entities"
import { readFilters, replaceFilters, toggleFacet, type FacetKey } from "@/lib/filters"
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
	/** native tooltip; defaults to "<label> · <kind>" */
	title?: string
	className?: string
	recordingKey?: string
}

/** Filter-only kinds and the Explorer facet each one toggles. */
const FILTER_FACET: Partial<Record<EntityKind, FacetKey>> = { tag: "tags", year: "years" }

/**
 * A reference to an entity, IDE "symbol" style: kind glyph + label (+ count).
 *
 * - Page kinds (origin, vendor, style, category, cultivar) link to their page (§2.3; pages for
 *   origins, styles and cultivars arrive in Phase 3, so those links don't prefetch yet).
 * - Filter kinds (tag, vintage) are toggle buttons for the Explorer's ?tags= / ?years= filter,
 *   pressed while that filter is on. Rendered under a Suspense boundary (they read the URL).
 */
export default function EntityRef(props: EntityRefProps) {
	const facet = FILTER_FACET[props.kind]
	return facet ? <FilterRef {...props} facet={facet} /> : <PageRef {...props} />
}

function PageRef({ kind, slug, className, recordingKey, title, ...rest }: EntityRefProps) {
	const href = entityHref(kind, slug) ?? "#"
	const meta = ENTITY_META[kind]
	return (
		<Link
			href={href}
			prefetch={meta.routeReady ? undefined : false}
			title={title ?? tooltip(rest.label, kind, rest.count)}
			data-entity-kind={kind}
			data-entity-slug={slug}
			data-recording-key={recordingKey}
			aria-current={rest.current ? "location" : undefined}
			className={cn(base(rest.variant), className)}
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

function tooltip(label: ReactNode, kind: EntityKind, count?: number) {
	const name = typeof label === "string" ? label : ""
	const sessions = count ? ` · ${count} ${count === 1 ? "session" : "sessions"}` : ""
	return `${name}${name ? " · " : ""}${ENTITY_META[kind].label}${sessions}`
}
