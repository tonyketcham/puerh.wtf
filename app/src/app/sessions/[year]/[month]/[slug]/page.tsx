import type { CSSProperties } from "react"
import { getSession, getSessionRoutes } from "@/lib/api"
import { notFound } from "next/navigation"
import SessionCarousel from "@/components/session/SessionCarousel"
import { SetSessionState } from "@/app/sessions/[year]/[month]/[slug]/SetSessionState"
import { generateSessionRotation } from "@/app/sessions/[year]/[month]/[slug]/generateSessionRotation"
import { liquorVars } from "@/lib/liquor"
import SessionTitle from "@/lib/components/session/SessionTitle"
import SteepGutter from "@/lib/components/session/SteepGutter"
import DescriptorHighlighter from "@/lib/components/session/DescriptorHighlighter"
import FlowAroundArticle from "@/lib/components/session/FlowAroundArticle"

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

export default async function SessionPage(props: SessionPageProps) {
	const params = await props.params
	const session = await getSession(params.slug)

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
			<SteepGutter key={`gutter-${session._slug}`} slug={session._slug} brewing={session.brewing}>
				{/* The cube sits inside the notes; the prose flows around both sides of it.
				    Only FlowAroundArticle rebuilds the article's DOM: everyone else measures it and
				    highlights via the CSS Custom Highlight API */}
				<FlowAroundArticle
					html={session._content.html}
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
		</div>
	)
}
