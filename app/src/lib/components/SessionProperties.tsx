"use client"

import RadarChart from "@/lib/components/dataviz/radar/RadarChart"
import DetailsListItem from "@/lib/components/DetailsListItem"
import type { SessionFull, SessionNotes } from "@/lib/types/session"
import SimpleBar from "simplebar-react"
import "simplebar-react/dist/simplebar.min.css"
import PanelSection from "./containers/PanelSection"

interface SessionPropertiesProps {
	session: SessionFull
}

const noteDisplayConfig: Record<keyof SessionNotes, { title: string; icon: React.ReactNode }> = {
	dry_leaf_nose: {
		title: "Dry Leaf",
		icon: (
			<svg
				width="14"
				height="22"
				viewBox="0 0 14 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<g clipPath="url(#clip0_1_121)">
					<path
						d="M2.55925 14.9132L2.55925 14.9157C2.54125 16.1504 2.89036 17.0953 3.0238 17.41C6.26564 16.5417 8.56165 14.9617 9.85018 12.7124C11.4685 9.88656 10.9988 6.80082 10.8118 5.90435C9.5004 7.1331 8.57059 7.61697 7.74589 8.04666C7.48894 8.18029 7.24642 8.30672 7.0094 8.44751C6.49055 8.75571 6.01913 9.07632 5.60737 9.40142C5.2972 9.64434 5.01717 9.89031 4.76479 10.137C4.38601 10.5072 4.06913 10.8804 3.80472 11.2504C3.45245 11.7438 3.19348 12.2315 3.00596 12.7002C2.92379 12.9055 2.85553 13.1069 2.79896 13.3036C2.62933 13.8931 2.56607 14.4401 2.55925 14.9132Z"
						stroke="#EDC446"
						strokeLinejoin="round"
					/>
				</g>
				<defs>
					<clipPath id="clip0_1_121">
						<rect width="14" height="22" fill="white" />
					</clipPath>
				</defs>
			</svg>
		),
	},
	wet_leaf_nose: {
		title: "Wet Leaf",
		icon: (
			<svg
				width="14"
				height="22"
				viewBox="0 0 14 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M9.20584 16.2743L9.20487 16.2766C8.73607 17.419 8.04366 18.1506 7.79727 18.3875C5.1577 16.3148 3.66755 13.9595 3.36691 11.3847C2.98958 8.1502 4.63443 5.49749 5.1588 4.7467C5.88163 6.39202 6.5464 7.20244 7.13581 7.92171C7.31955 8.14558 7.49285 8.35716 7.65545 8.57979C8.01139 9.06713 8.31883 9.54724 8.56967 10.008C8.75938 10.3533 8.92018 10.6896 9.05526 11.0156C9.25803 11.5049 9.40271 11.9726 9.50043 12.4167C9.63038 13.0089 9.6768 13.5591 9.66499 14.0638C9.65984 14.2849 9.64344 14.4969 9.61815 14.7C9.5424 15.3087 9.38555 15.8366 9.20584 16.2743Z"
					stroke="#EDC446"
					strokeLinejoin="round"
				/>
				<path
					d="M13 4C13 4.55228 12.5523 5 12 5C11.4477 5 11 4.55228 11 4C11 3.44772 11.4477 3 12 3C12.5523 3 13 3.44772 13 4Z"
					fill="#EDC446"
				/>
				<circle cx="8.5" cy="2.5" r="0.5" fill="#EDC446" />
				<circle cx="10.75" cy="7.75" r="0.75" fill="#EDC446" />
			</svg>
		),
	},
	mouthfeel: {
		title: "Mouthfeel",
		icon: (
			<svg
				width="14"
				height="22"
				viewBox="0 0 14 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M13 4C13 4.55228 12.5523 5 12 5C11.4477 5 11 4.55228 11 4C11 3.44772 11.4477 3 12 3C12.5523 3 13 3.44772 13 4Z"
					fill="#EDC446"
				/>
				<circle cx="8.5" cy="2.5" r="0.5" fill="#EDC446" />
				<circle cx="10.75" cy="7.75" r="0.75" fill="#EDC446" />
				<line x1="2.5" y1="6.5" x2="12.5" y2="6.5" stroke="#EDC446" strokeLinecap="round" />
				<line x1="2.5" y1="9.5" x2="12.5" y2="9.5" stroke="#EDC446" strokeLinecap="round" />
				<path
					d="M2.5 13.5C5.43224 13.181 7.5 14 12.5 13.5"
					stroke="#EDC446"
					strokeLinecap="round"
				/>
				<line x1="2.5" y1="15.5" x2="12.5" y2="15.5" stroke="#EDC446" strokeLinecap="round" />
				<line x1="2.5" y1="17.5" x2="12.5" y2="17.5" stroke="#EDC446" strokeLinecap="round" />
			</svg>
		),
	},
	taste: {
		title: "Taste",
		icon: (
			<svg
				width="14"
				height="22"
				viewBox="0 0 14 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M7 12.5C7 12.5 8 13.5 10 12.5"
					stroke="#EDC446"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		),
	},
	finish: {
		title: "Finish",
		icon: (
			<svg
				width="14"
				height="22"
				viewBox="0 0 14 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M7 21C10.866 21 14 17.866 14 14C14 10.134 10.866 7 7 7C3.13401 7 0 10.134 0 14C0 17.866 3.13401 21 7 21Z"
					stroke="#EDC446"
				/>
				<path d="M7 10V14H10" stroke="#EDC446" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		),
	},
	empty_cup: {
		title: "Empty Cup",
		icon: (
			<svg
				width="14"
				height="22"
				viewBox="0 0 14 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M1 8H13V15C13 18.3137 10.3137 21 7 21C3.68629 21 1 18.3137 1 15V8Z"
					stroke="#EDC446"
				/>
			</svg>
		),
	},
	cha_qi: {
		title: "Cha Qi",
		icon: (
			<svg
				width="14"
				height="22"
				viewBox="0 0 14 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d="M7 1C7 1 8 5 11 5" stroke="#EDC446" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M7 1C7 1 6 5 3 5" stroke="#EDC446" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M7 8V1" stroke="#EDC446" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		),
	},
}

export default function SessionProperties({ session }: SessionPropertiesProps) {
	return (
		<aside className="fixed inset-y-0 right-0 flex flex-col w-[340px] h-full p-8 space-y-10 pointer-events-none font-fira-code">
			<div className="relative flex flex-col min-h-0 overflow-hidden border shadow-lg pointer-events-auto grow rounded-2xl border-heicha-500">
				<div className="absolute inset-0 bg-sidebar backdrop-blur-xl" />
				{/* Content Wrapper */}
				<div className="relative flex flex-col h-full">
					<SimpleBar
						style={{
							containerType: "size",
							height: "100cqh",
						}}
					>
						<PanelSection title="Flavor Profile" hasBottomBorder hasPadding={false}>
							{session.flavor_axes && <RadarChart data={session.flavor_axes} />}
						</PanelSection>

						<PanelSection title="Notes">
							<ul className="space-y-4">
								{Object.entries(session.notes).map(([key, value]) => {
									if (!value) return null
									const config = noteDisplayConfig[key as keyof SessionNotes]
									if (!config) return null

									return (
										<DetailsListItem
											key={key}
											icon={config.icon}
											title={config.title}
											value={value}
										/>
									)
								})}
							</ul>
						</PanelSection>
					</SimpleBar>
				</div>
			</div>
		</aside>
	)
}
