import Heading2 from "@/lib/components/typography/Heading2"
import SessionCard from "@/lib/components/SessionCard"
import { getSessions, getVendorBySlug, getVendors } from "@/lib/api"

export async function generateStaticParams() {
	const vendors = await getVendors()
	return vendors.map((v) => ({ slug: v._slug }))
}

interface VendorPageProps {
	params: Promise<{ slug: string }>
}

export default async function VendorPage({ params }: VendorPageProps) {
	const slug = (await params).slug

	const [vendor, sessions] = await Promise.all([
		getVendorBySlug(slug),
		getSessions({ withImages: true }),
	])

	const vendorSessions = sessions.filter((s) => (s.vendor || []).some((v) => v._slug === slug))

	return (
		<div className="space-y-6">
			<section className="flex items-start gap-4">
				{vendor.image && (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={vendor.image}
						alt={vendor.title}
						className="object-cover w-24 h-24 border rounded-md border-heicha-600"
					/>
				)}
				<div className="flex-1">
					<Heading2>{vendor.title}</Heading2>
					<div className="space-x-2 text-sm text-white/70">
						{vendor.location && <span>{vendor.location}</span>}
						{vendor.municipality && <span>{vendor.municipality}</span>}
						{vendor.country && <span>{vendor.country}</span>}
					</div>
					{vendor.links && (
						<div className="flex flex-wrap gap-2 mt-2 text-sm">
							{vendor.links.website && (
								<a
									className="underline text-tea-soup-400"
									href={vendor.links.website}
									target="_blank"
									rel="noreferrer"
								>
									Website
								</a>
							)}
							{vendor.links.instagram && (
								<a
									className="underline text-tea-soup-400"
									href={vendor.links.instagram}
									target="_blank"
									rel="noreferrer"
								>
									Instagram
								</a>
							)}
							{vendor.links.twitter && (
								<a
									className="underline text-tea-soup-400"
									href={vendor.links.twitter}
									target="_blank"
									rel="noreferrer"
								>
									X/Twitter
								</a>
							)}
							{vendor.links.facebook && (
								<a
									className="underline text-tea-soup-400"
									href={vendor.links.facebook}
									target="_blank"
									rel="noreferrer"
								>
									Facebook
								</a>
							)}
							{vendor.links.youtube && (
								<a
									className="underline text-tea-soup-400"
									href={vendor.links.youtube}
									target="_blank"
									rel="noreferrer"
								>
									YouTube
								</a>
							)}
						</div>
					)}
					{(vendor._content?.html || vendor.description) && (
						<div
							className="mt-4 prose prose-invert max-w-none"
							dangerouslySetInnerHTML={{
								__html: vendor._content?.html || vendor.description || "",
							}}
						/>
					)}
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-sm text-tea-soup-400">Sessions</h3>
				<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-1 items-start">
					{vendorSessions.map((s) => (
						<SessionCard key={s.id} session={s} />
					))}
					{vendorSessions.length === 0 && (
						<div className="text-sm text-white/60">No sessions found for this vendor.</div>
					)}
				</div>
			</section>
		</div>
	)
}
