import type { Metadata } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import "../app.css"
import Explorer from "../lib/components/Explorer"
import SiteHeader from "../lib/components/SiteHeader"
import { getExplorerSessions, getVendors, getCategories } from "@/lib/api"
import { StoreProvider } from "@/lib/store/StoreProvider"
import { HydrateExplorerSessions } from "@/lib/store/HydrateExplorerSessions"
import CommandBar from "@/lib/components/command/CommandBar"
import EntityPeekHost from "@/lib/components/entity/peek/EntityPeekHost"
import AuthoringMount from "@/lib/authoring/AuthoringMount"
import ScrollReset from "@/lib/components/ScrollReset"
import { getEntityDetails } from "@/lib/entityDetails.server"

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
})

const firaCode = localFont({
	src: "../../static/fonts/Fira_Code/FiraCode-VF.woff2",
	variable: "--font-fira-code",
})

const rock3d = localFont({
	src: "../../static/fonts/Rock_3D/Rock3D-Regular.ttf",
	variable: "--font-rock-3d",
})

export const metadata: Metadata = {
	title: "puerh.wtf - a tea log",
	description:
		"A tea log for documenting tea sessions to learn complexities like terroir in retrospect while focusing more on an individual tea.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const [sessions, vendors, categories, entityDetails] = await Promise.all([
		getExplorerSessions(),
		getVendors(),
		getCategories(),
		getEntityDetails(),
	])

	return (
		<html lang="en">
			<body className={`${inter.variable} ${firaCode.variable} ${rock3d.variable}`}>
				<StoreProvider>
					<ScrollReset />
					<AuthoringMount />
					<HydrateExplorerSessions sessions={sessions} />
					<div className="relative flex flex-row">
						<Explorer sessions={sessions} vendors={vendors} categories={categories} />
						<div className="flex flex-col w-full min-w-0 ml-[var(--explorer-w)]">
							{/* below xl the Explorer is a drawer, so the masthead (with its toggle) rides above
							    the page; it clears the fixed Properties panel like main does */}
							<SiteHeader
								compact
								className="pt-[calc(var(--commandbar-h)+0.5rem)] lg:px-8 lg:mr-[var(--rightpanel-w)] xl:hidden"
							/>
							{/* top: room for the command bar (the masthead's job below xl); right: the fixed
							    Properties panel; bottom: the status bar (0 off session pages). Below lg x clips
							    whatever leans past a phone's edge (the carousel cube's faces) */}
							<main className="w-full min-w-0 px-4 pt-4 max-lg:overflow-x-clip lg:px-8 lg:pr-[calc(var(--rightpanel-w)+2rem)] xl:pt-[calc(var(--commandbar-h)+2rem)] pb-[calc(var(--statusbar-h)+2rem)]">
								{children}
							</main>
						</div>
					</div>
					<CommandBar
						sessions={sessions}
						vendors={vendors}
						categories={categories}
						details={entityDetails}
					/>
					{/* one EntityPeek card for every entity ref on the page */}
					<EntityPeekHost details={entityDetails} />
					<div className="fixed inset-0 z-50 pointer-events-none" id="portal-top-fixed" />
				</StoreProvider>
			</body>
		</html>
	)
}
