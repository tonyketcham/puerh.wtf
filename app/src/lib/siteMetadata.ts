/**
 * Page metadata shared by every route: canonical URL, Open Graph and Twitter cards.
 * Next replaces (does not merge) a parent's `openGraph`/`twitter` objects, so each page
 * builds its full set here instead of relying on the root layout's defaults.
 */
import type { Metadata } from "next"

export const SITE_URL = "https://puerh.wtf"
export const SITE_NAME = "puerh.wtf"
export const SITE_TITLE = "puerh.wtf - a tea log"
export const SITE_DESCRIPTION =
	"A tea log for documenting tea sessions to learn complexities like terroir in retrospect while focusing more on an individual tea."

export type PageMetadataInput = {
	title: string
	description: string
	/** site-relative path with trailing slash, e.g. `/vendors/` */
	path: string
	image?: { url: string; alt?: string } | null
	type?: "website" | "article"
	/** ISO date, for articles */
	publishedTime?: string | null
}

export function pageMetadata({
	title,
	description,
	path,
	image,
	type = "website",
	publishedTime,
}: PageMetadataInput): Metadata {
	const images = image ? [{ url: image.url, alt: image.alt || title }] : undefined
	return {
		title,
		description,
		alternates: { canonical: path },
		openGraph: {
			title,
			description,
			url: path,
			siteName: SITE_NAME,
			locale: "en_US",
			type,
			...(type === "article" && publishedTime ? { publishedTime } : {}),
			...(images ? { images } : {}),
		},
		twitter: {
			card: images ? "summary_large_image" : "summary",
			title,
			description,
			...(images ? { images } : {}),
		},
	}
}

/** Route of a session page, matching the static params of app/sessions/[year]/[month]/[slug]. */
export function sessionPath(session: { _slug: string; date?: string | null }): string {
	const date = session.date ? new Date(session.date) : null
	if (!date) return `/sessions/${session._slug}/`
	const month = String(date.getMonth() + 1).padStart(2, "0")
	return `/sessions/${date.getFullYear()}/${month}/${session._slug}/`
}
