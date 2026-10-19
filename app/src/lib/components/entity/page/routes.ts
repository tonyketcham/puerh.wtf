/**
 * Shared halves of the entity route files (app/{vendors,origins,styles,cultivars,categories}),
 * which stay thin: static params for the export and per-entity metadata.
 */
import type { Metadata } from "next"
import { ENTITY_META } from "@/lib/entities"
import type { PageKind } from "@/lib/peek"
import { getEntityPage, getEntitySlugs, summarize } from "./data"

export type SlugParams = { params: Promise<{ slug: string }> }

/** Every entity of a kind gets a page, tasted or not. */
export async function entityStaticParams(kind: PageKind) {
	return (await getEntitySlugs(kind)).map((slug) => ({ slug }))
}

/** Route params arrive percent-encoded for non-ASCII slugs. */
export function decodeSlug(slug: string): string {
	try {
		return decodeURIComponent(slug)
	} catch {
		return slug
	}
}

export async function entityMetadata(kind: PageKind, { params }: SlugParams): Promise<Metadata> {
	const data = await getEntityPage(kind, decodeSlug((await params).slug))
	if (!data) return {}
	return {
		title: `${data.title} · ${ENTITY_META[kind].label} · puerh.wtf`,
		description:
			summarize(data.description, 200) ??
			`${data.title}, a ${ENTITY_META[kind].label} in the puerh.wtf tea log.`,
	}
}
