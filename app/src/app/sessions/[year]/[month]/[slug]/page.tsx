import { getSession, getSessions } from "@/lib/api"
import { notFound } from "next/navigation"
import Image from "next/image"
import SessionProperties from "@/lib/components/SessionProperties"

interface SessionPageProps {
	params: {
		year: string
		month: string
		slug: string
	}
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

export default async function SessionPage({ params }: SessionPageProps) {
	const session = await getSession(params.slug)

	if (!session) {
		notFound()
	}

	return (
		<main className="flex-1 bg-background text-ink">
			<div className="grid grid-cols-12 gap-8 p-8">
				<div className="col-span-8 space-y-8">
					<h1 className="font-rock-3d text-8xl text-shadow-2xl">{session.title}</h1>

					{session.images && session.images.length > 0 && (
						<div className="relative h-[500px]">
							<Image
								src={session.images[0].image}
								alt={session.images[0].alt || ""}
								fill
								className="object-cover rounded-lg"
							/>
						</div>
					)}

					<article
						className="prose prose-invert max-w-none"
						dangerouslySetInnerHTML={{ __html: session._content.html }}
					/>
				</div>

				<SessionProperties session={session} />
			</div>
		</main>
	)
}
