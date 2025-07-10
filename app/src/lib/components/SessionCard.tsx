import Link from "next/link"
import type { SessionPreviewWithFeatureImage } from "../types/session"
import { buildLink } from "../utils/BuildLinkToGivenCollectionNode"
import TornTape from "./TornTape"

interface SessionCardProps {
	session: SessionPreviewWithFeatureImage
}

export default function SessionCard({ session }: SessionCardProps) {
	return (
		<article className="box-border relative w-full border group rounded-2xl border-heicha-500">
			<TornTape seed={session.id} color={session?.style?.[0]?.category?.color} />
			<Link
				href={buildLink(session)}
				className="relative z-0 flex flex-col overflow-hidden divide-y-2 rounded-2xl bg-heicha-700 bg-opacity-40 lg:flex-row lg:divide-y-0 lg:divide-x-2 divide-white/5"
			>
				<div className="shrink-0 w-full h-32 overflow-hidden lg:w-40">
					<img
						src={session.images?.[0]?.image}
						alt={session.images?.[0]?.alt}
						className="object-cover w-full h-full image-zoom"
					/>
				</div>
				<div className="p-5">
					<h3 className="space-x-3 text-xl lg:text-2xl">
						{session.production_year && (
							<span className="opacity-80 group-hover:opacity-100 group-hover:text-white">
								{session.production_year}
							</span>
						)}
						<span className="opacity-80 group-hover:opacity-100 group-hover:text-tea-soup-500">
							{session.title}
						</span>
					</h3>
					<p className="mt-2 text-bai-cha-200 opacity-60 group-hover:opacity-80 line-clamp-3">
						{session.excerpt}
					</p>
				</div>
			</Link>
		</article>
	)
}
