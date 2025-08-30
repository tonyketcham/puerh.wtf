import { getSession, getSessions } from "@/lib/api"
import { notFound } from "next/navigation"
import Image from "next/image"
import SessionCarousel from "@/components/session/SessionCarousel"
import { SetSessionState } from "@/app/sessions/[year]/[month]/[slug]/SetSessionState"

interface SessionPageProps {
	params: Promise<{
		year: string
		month: string
		slug: string
	}>
}

export async function generateStaticParams() {
	const sessions = await getSessions()
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

	return (
		<>
			{/* Sync session data to the store */}
			<SetSessionState session={session} />

			<h1 className="font-rock-3d text-8xl text-shadow-2xl">{session.title}</h1>

			<div className="relative">
				{session.images && session.images.length > 0 && (
					<div className="float-right clear-right mb-8 ml-8">
						<SessionCarousel images={session.images} recordingKey="session-hero-carousel" />
					</div>
				)}

				<article
					className="prose prose-invert max-w-none"
					dangerouslySetInnerHTML={{ __html: session._content.html }}
				/>
			</div>
		</>
	)
}
