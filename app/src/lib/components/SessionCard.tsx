import Link from 'next/link';
import type { SessionPreviewWithFeatureImage } from '../types/session';
import { buildLink } from '../utils/BuildLinkToGivenCollectionNode';

interface SessionCardProps {
	session: SessionPreviewWithFeatureImage;
}

export default function SessionCard({ session }: SessionCardProps) {
	return (
		<article className="box-border relative w-full overflow-hidden border group h-28 rounded-2xl border-white/5 bg-heicha-700 bg-opacity-40">
			<Link href={buildLink(session)} className="flex flex-row divide-x-2 divide-white/5">
				<div className="flex flex-col justify-center flex-shrink-0 w-40 h-full overflow-hidden">
					<img
						src={session.images?.[0]?.image}
						alt={session.images?.[0]?.alt}
						className="object-cover image-zoom"
					/>
				</div>
				<div className="p-5">
					<h3 className="text-2xl">
						{session.production_year && (
							<span className="opacity-80 group-hover:opacity-100 group-hover:text-white">
								{session.production_year}
							</span>
						)}
						<span className="opacity-80 group-hover:opacity-100 group-hover:text-tea-soup-500">
							{session.title}
						</span>
					</h3>
					<p className="text-bai-cha-200 opacity-60 group-hover:opacity-80">{session.excerpt}</p>
				</div>
			</Link>
			<div className="absolute top-2.5 right-2.5">
				<span
					className="block w-3 h-3 rounded-2xl"
					style={{ backgroundColor: session?.style?.[0]?.category?.color }}
				/>
			</div>
		</article>
	);
}
