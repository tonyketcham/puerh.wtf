import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import SessionCard from "@/lib/components/SessionCard"
import type { PageKind } from "@/lib/peek"
import { entityKeys, related, sessionColor, sessionsOf, sourcedThrough } from "@/lib/relations"
import { getEntityPage, getOriginPoints, getServerIndex } from "./data"
import type { DotMapPoint } from "./DotMap"
import EntityPage from "./EntityPage"
import { getMapPoints } from "@/lib/components/map/points"
import Markdown, { paragraphCount } from "./Markdown"
import { blendColors, buildEntityModel, liftedColor } from "./model"

/** Kinds whose hero sets the description's first paragraph as prose (the rest goes to Notes). */
const LEAD_KINDS: readonly PageKind[] = ["style", "category", "cultivar", "vessel"]

/**
 * Server half of an entity page: loads the entity, renders its SessionCards (they compute
 * ages at build time, so they stay server components) and its description, and hands all of
 * it to the client template. 404s for a slug that doesn't exist.
 */
export default async function EntityPageServer({ kind, slug }: { kind: PageKind; slug: string }) {
	const [data, index, origins] = await Promise.all([
		getEntityPage(kind, slug),
		getServerIndex(),
		getOriginPoints(),
	])
	if (!data) notFound()

	// one clock for every card, so tapes age against the same "now"
	const now = new Date()
	const cards: Record<string, ReactNode> = {}
	for (const s of sessionsOf(index, kind, slug)) {
		cards[s._slug] = <SessionCard session={s} now={now} />
	}

	// vendors: teas they supplied to another vendor, who sold them on
	const supplied =
		kind === "vendor"
			? sourcedThrough(index, slug).map((s) => ({
					slug: s._slug,
					card: <SessionCard session={s} now={now} />,
			  }))
			: []

	// vendors and cultivars: where their teas grew, as dots in the page's accent
	let points: DotMapPoint[] = []
	if (kind === "style" || kind === "category") {
		// styles and categories (plan §2.4): only this group's rings, each in the blended liquor
		// of the group's sessions from that origin
		const own = sessionsOf(index, kind, slug)
		points = related(index, kind, slug, "origin", { rollup: false })
			.map(({ node, count }) => {
				const p = origins[node.slug]
				if (!p) return null
				const there = own.filter((s) =>
					entityKeys(s, "origin", { rollup: false }).includes(node.slug)
				)
				const color = there.length ? liftedColor(blendColors(there.map(sessionColor))) : undefined
				return { slug: p.slug, title: p.title, lat: p.lat, lon: p.lon, count, color }
			})
			.filter((p): p is NonNullable<typeof p> => !!p)
	} else if (kind === "vendor" || kind === "cultivar") {
		const accent = buildEntityModel(index, kind, slug).accentText
		points = related(index, kind, slug, "origin", { rollup: false })
			.map(({ node, count }) => {
				const p = origins[node.slug]
				return p
					? { slug: p.slug, title: p.title, lat: p.lat, lon: p.lon, count, color: accent }
					: null
			})
			.filter((p): p is NonNullable<typeof p> => !!p)
	}

	const hasLead = LEAD_KINDS.includes(kind) && !!data.description
	const lead = hasLead ? <Markdown source={data.description!.split(/\n\s*\n/)[0]} /> : undefined
	const rest = hasLead ? paragraphCount(data.description) > 1 : !!data.description
	const notes = rest || data.contentHtml ? (
		<div className="space-y-6">
			{rest && <Markdown source={data.description} skipFirst={hasLead} />}
			{data.contentHtml && <div className="prose prose-invert max-w-none" data-entity-body dangerouslySetInnerHTML={{ __html: data.contentHtml }} />}
		</div>
	) : undefined

	// origins: the hero map frames the placed points within a node too coarse for an inset
	const mapPoints = kind === "origin" ? getMapPoints() : undefined

	return (
		<EntityPage
			data={data}
			cards={cards}
			lead={lead}
			notes={notes}
			points={points}
			mapPoints={mapPoints}
			supplied={supplied}
		/>
	)
}
