import { getExplorerSessions } from "@/lib/api"
import { SITE_URL, sessionPath } from "@/lib/siteMetadata"

export const dynamic = "force-static"
const escapeXml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!)
	)

export async function GET() {
	const sessions = await getExplorerSessions()
	const items = sessions
		.map((session) => {
			const link = SITE_URL + sessionPath(session)
			return `<item><title>${escapeXml(session.title)}</title><link>${escapeXml(
				link
			)}</link><guid isPermaLink="true">${escapeXml(link)}</guid><pubDate>${new Date(
				session.date
			).toUTCString()}</pubDate><description>${escapeXml(
				session.excerpt || ""
			)}</description></item>`
		})
		.join("")
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>puerh.wtf · a tea log</title><link>https://puerh.wtf/</link><description>Tea sessions, tasting notes and brewing observations.</description><language>en</language>${items}</channel></rss>`,
		{ headers: { "Content-Type": "application/rss+xml; charset=utf-8" } }
	)
}
