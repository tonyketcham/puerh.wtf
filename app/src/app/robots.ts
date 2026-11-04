import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/siteMetadata"

export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
	return {
		// authoring views are already noindex; the fixture pages only render in dev/test builds
		rules: { userAgent: "*", allow: "/", disallow: ["/write/", "/working-changes/", "/tests/"] },
		sitemap: `${SITE_URL}/sitemap.xml`,
	}
}
