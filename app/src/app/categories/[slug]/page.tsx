import Heading2 from "@/lib/components/typography/Heading2"
import SessionCard from "@/lib/components/SessionCard"
import { getCategoryBySlug, getSessions, getCategories } from "@/lib/api"

export async function generateStaticParams() {
	const categories = await getCategories()
	return categories.map((c) => ({ slug: c._slug }))
}

interface CategoryPageProps {
	params: Promise<{ slug: string }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
	const slug = (await params).slug

	const [category, sessions] = await Promise.all([
		getCategoryBySlug(slug),
		getSessions({ withImages: true }),
	])

	const categorySessions = sessions.filter((s) =>
		(s.style || []).some((st) => st.category && st.category._slug === slug)
	)

	return (
		<div className="space-y-6">
			<section>
				<Heading2 auxiliaryInfo={<span className="text-sm text-white/70 block">Category</span>}>
					{category.title}
				</Heading2>
				{category.description && (
					<p className="text-white/70 max-w-prose">{category.description}</p>
				)}
				{category._content?.html && (
					<div
						className="prose prose-invert max-w-none mt-4"
						dangerouslySetInnerHTML={{ __html: category._content.html }}
					/>
				)}
			</section>

			<section className="space-y-3">
				<h3 className="text-sm text-tea-soup-400">Sessions</h3>
				<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-1 items-start">
					{categorySessions.map((s) => (
						<SessionCard key={s.id} session={s} />
					))}
					{categorySessions.length === 0 && (
						<div className="text-white/60 text-sm">No sessions found for this category.</div>
					)}
				</div>
			</section>
		</div>
	)
}
