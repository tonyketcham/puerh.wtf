import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import SessionCard from "@/lib/components/SessionCard"
import type { PageKind } from "@/lib/peek"
import { related, sessionsOf } from "@/lib/relations"
import { getEntityPage, getOriginPoints, getServerIndex } from "./data"
import type { DotMapPoint } from "./DotMap"
import EntityPage from "./EntityPage"
import { getMapPoints } from "@/lib/components/map/points"
import Markdown, { paragraphCount } from "./Markdown"
import { buildEntityModel } from "./model"

/** Kinds whose hero sets the description's first paragraph as prose (the rest goes to Notes). */
const LEAD_KINDS: readonly PageKind[] = ["style", "category", "cultivar"]

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

	// vendors and cultivars: where their teas grew, as dots
	let points: DotMapPoint[] = []
	if (kind === "vendor" || kind === "cultivar") {
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
	const notes = rest ? <Markdown source={data.description} skipFirst={hasLead} /> : undefined

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
		/>
	)
}
