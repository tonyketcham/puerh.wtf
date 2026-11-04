import type { CSSProperties } from "react"
import type { Metadata } from "next"
import { pageMetadata, sessionPath } from "@/lib/siteMetadata"
import { getSession, getSessionRoutes, getExplorerSessions } from "@/lib/api"
import { notFound } from "next/navigation"
import SessionCarousel from "@/lib/components/session/SessionCarousel"
import { SetSessionState } from "@/app/sessions/[year]/[month]/[slug]/SetSessionState"
import { generateSessionRotation } from "@/app/sessions/[year]/[month]/[slug]/generateSessionRotation"
import { liquorVars } from "@/lib/liquor"
import SessionTitle from "@/lib/components/session/SessionTitle"
import SteepGutter from "@/lib/components/session/SteepGutter"
import DescriptorHighlighter from "@/lib/components/session/DescriptorHighlighter"
import FlowAroundArticle from "@/lib/components/session/FlowAroundArticle"
import SessionContinuation from "@/lib/components/session/SessionContinuation"
import { infusionHtml } from "@/lib/session-journal.mjs"

interface SessionPageProps {
	params: Promise<{
		year: string
		month: string
		slug: string
	}>
}

export async function generateStaticParams() {
	const sessions = await getSessionRoutes()
	return sessions.map((session) => {
		const date = session.date ? new Date(session.date) : null
		return {
			year: date ? String(date.getFullYear()) : "",
			month: date ? String(date.getMonth() + 1).padStart(2, "0") : "",
			slug: session._slug,
		}
	})
}

export async function generateMetadata(props: SessionPageProps): Promise<Metadata> {
	const session = await getSession((await props.params).slug)
	if (!session) return {}

	const name = [session.production_year, session.title].filter(Boolean).join(" ")
	const style = session.style?.[0]?.title
	const origin = session.origin?.[0]?.title
	const vendor = session.vendor?.[0]?.title
	const day = session.date ? session.date.slice(0, 10) : null
	// Excerpts can be a few words ("yea it's nice"), so the description always says what the tea is.
	const facts = [
		[style, origin && `from ${origin}`].filter(Boolean).join(" "),
		vendor && `via ${vendor}`,
		day && `tasted ${day}`,
	]
		.filter(Boolean)
		.join(", ")
	const excerpt = session.excerpt.trim().replace(/[.!?]*$/, "")
	const lead = excerpt ? excerpt.charAt(0).toUpperCase() + excerpt.slice(1) : ""
	const photo = session.images?.[0]

	return pageMetadata({
		title: `${name} · session · puerh.wtf`,
		description: [lead, facts && `${name}: ${facts}`].filter(Boolean).join(". ") + ".",
		path: sessionPath(session),
		image: photo ? { url: photo.image, alt: photo.alt } : null,
		type: "article",
		publishedTime: session.date,
	})
}

export default async function SessionPage(props: SessionPageProps) {
	const params = await props.params
	const [session, sessions] = await Promise.all([getSession(params.slug), getExplorerSessions()])

	if (!session) {
		notFound()
	}

	// Generate a unique rotation for this session
	const rotation = generateSessionRotation(session._slug)

	return (
		<div
			className="space-y-8"
			data-session-root
			data-session-slug={session._slug}
			style={liquorVars(session._slug) as CSSProperties}
		>
			{/* Sync session data to the store (must stay first: resets per-page atoms) */}
			<SetSessionState session={session} />

			<SessionTitle
				key={`title-${session._slug}`}
				title={session.title}
				slug={session._slug}
				productionYear={session.production_year}
			/>

			{/* keyed: a fresh gutter (mentions, measurements, arbitration refs) per session */}
			<SteepGutter
				key={`gutter-${session._slug}`}
				slug={session._slug}
				brewing={session.brewing}
				infusions={session.infusions}
			>
				{/* The cube sits inside the notes; the prose flows around both sides of it.
				    Only FlowAroundArticle rebuilds the article's DOM: everyone else measures it and
				    highlights via the CSS Custom Highlight API */}
				<FlowAroundArticle
					html={session._content.html + infusionHtml(session.infusions)}
					obstacle={
						session.images && session.images.length > 0 ? (
							<SessionCarousel
								images={session.images}
								cssRotation={rotation}
								recordingKey="session-hero-carousel"
							/>
						) : null
					}
				/>
			</SteepGutter>

			<DescriptorHighlighter />
			<SessionContinuation
				session={session}
				sessions={sessions}
				recordingKey="session-continuation"
			/>
		</div>
	)
}
