import type { MetadataRoute } from "next"
import { getSessionRoutes } from "@/lib/api"
import { getEntitySlugs } from "@/lib/content/entities.server"
import { entityHref } from "@/lib/entities"
import type { PageKind } from "@/lib/peek"
import { SITE_URL, sessionPath } from "@/lib/siteMetadata"
import { getServerLexicon } from "./lexicon/_components/server"

export const dynamic = "force-static"

const INDEX_PATHS = ["/origins/", "/vendors/", "/styles/", "/cultivars/", "/teaware/", "/lexicon/"]
const ENTITY_KINDS: PageKind[] = ["origin", "vendor", "style", "category", "cultivar", "vessel"]

/** Every public page of the export; the authoring and test routes stay out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const [sessions, entitySlugs, { lexicon }] = await Promise.all([
		getSessionRoutes(),
		Promise.all(ENTITY_KINDS.map(async (kind) => ({ kind, slugs: await getEntitySlugs(kind) }))),
		getServerLexicon(),
	])
	const url = (path: string) => new URL(path, SITE_URL).toString()
	const newest = sessions.map((s) => s.date).filter(Boolean).sort().at(-1)

	return [
		{ url: url("/"), lastModified: newest ?? undefined, priority: 1 },
		...INDEX_PATHS.map((path) => ({ url: url(path), priority: 0.6 })),
		...sessions.map((s) => ({ url: url(sessionPath(s)), lastModified: s.date, priority: 0.8 })),
		...entitySlugs.flatMap(({ kind, slugs }) =>
			slugs.flatMap((slug) => {
				const href = entityHref(kind, slug)
				return href ? [{ url: url(href), priority: 0.5 }] : []
			})
		),
		...lexicon.paged.map((entry) => ({ url: url(`/lexicon/${encodeURIComponent(entry.slug)}/`), priority: 0.3 })),
	]
}
