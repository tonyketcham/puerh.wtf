import type { SessionFull } from "../types/session"
import RadarChart from "./dataviz/radar/RadarChart"
import DetailListEntry from "./DetailListEntry"
import PartitionedDivider from "./PartitionedDivider"
import TeaStyleBadge from "./TeaStyleBadge"

interface SessionDetailsSidebarProps {
	session: SessionFull
}

function formatUrlReference(url: string, postfix: string) {
	const preppedURL = /\?/.test(url) ? url + "&" : url + "?"
	return preppedURL + postfix
}

function extractHostname(url: string) {
	const hostname = new URL(url).hostname
	// remove www. from hostname if it exists
	return hostname.replace(/^www\./, "")
}

export default function SessionDetailsSidebar({ session }: SessionDetailsSidebarProps) {
	return (
		<div className="flex flex-col space-y-7">
			<section className="w-full text-bai-cha-200">
				<RadarChart data={session.flavor_axes} />
			</section>

			<ul className="w-full p-2 space-y-3 overflow-hidden text-xs text-bai-cha-200">
				<li>
					<section>
						<h3 className="my-4 text-sm text-tea-soup-400">💽 deets</h3>
						<ul className="w-full space-y-2">
							<DetailListEntry label="excerpt" alignment="start">
								<p className="text-right">{session.excerpt}</p>
							</DetailListEntry>
							<DetailListEntry label="logged_on">
								<time>
									{new Intl.DateTimeFormat("default", {
										year: "numeric",
										month: "numeric",
										day: "numeric",
										hour: "numeric",
										minute: "numeric",
									}).format(new Date(session.date))}
								</time>
							</DetailListEntry>

							{(session.style ||
								session.production_year ||
								session.season ||
								session.elevation ||
								session.aging_conditions) && <PartitionedDivider />}
							{session.style && session.style.length > 0 && (
								<DetailListEntry label="style" alignment="start">
									<div className="w-2/3 space-y-0.5 text-right">
										{session.style.map((genre) => (
											<TeaStyleBadge
												key={genre.id}
												color={genre.color ?? genre.category.color}
												title={genre.title}
											/>
										))}
									</div>
								</DetailListEntry>
							)}
							{session.production_year && (
								<DetailListEntry label="production_year">
									<span>{session.production_year}</span>
								</DetailListEntry>
							)}
							{session.season && (
								<DetailListEntry label="season">
									<span>{session.season}</span>
								</DetailListEntry>
							)}
							{session.elevation && (
								<DetailListEntry label="elevation">
									<span>{session.elevation}m</span>
								</DetailListEntry>
							)}
							{session.aging_conditions && (
								<DetailListEntry label="aging" alignment="start">
									<span className="text-right">{session.aging_conditions}</span>
								</DetailListEntry>
							)}

							{(session.vendor || session.purchase_link) && <PartitionedDivider />}
							{session.vendor && (
								<DetailListEntry label="vendor">
									<div className="flex flex-row space-x-2 truncate place-items-center">
										{session.vendor[0].image && (
											<img
												src={session.vendor[0].image}
												alt={`${session.vendor[0].title} logo`}
												className="box-content object-cover object-center w-6 h-6 border rounded-full border-tea-soup-400 bg-heicha-500/30"
											/>
										)}
										<span className="truncate">{session.vendor[0].title}</span>
									</div>
								</DetailListEntry>
							)}
							{session.purchase_link && (
								<DetailListEntry label="purchase">
									<div className="flex flex-row space-x-2 truncate place-items-center">
										<a
											href={formatUrlReference(session.purchase_link, "ref=puerhwtf")}
											target="_blank"
											className="truncate text-tea-soup-400 hover:text-tea-soup-500/80 motion-safe:transition-all"
										>
											{extractHostname(session.purchase_link)}
										</a>
									</div>
								</DetailListEntry>
							)}
						</ul>
					</section>
				</li>

				<PartitionedDivider />
				<li>
					<section>
						<h3 className="my-4 text-sm text-tea-soup-400">📓 notes</h3>
						<ul className="w-full space-y-2">
							{Object.entries(session.notes).map(([label, description]) => (
								<DetailListEntry key={label} label={label} alignment="start">
									<span className="w-7/12 text-left">{description}</span>
								</DetailListEntry>
							))}
						</ul>
					</section>
				</li>
			</ul>
		</div>
	)
}
