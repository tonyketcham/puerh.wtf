import type { Metadata } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import "../app.css"
import Explorer from "../lib/components/Explorer"
import SiteHeader from "../lib/components/SiteHeader"
import { getExplorerSessions, getVendors, getCategories } from "@/lib/api"
import { StoreProvider } from "@/lib/store/StoreProvider"
import { Suspense } from "react"
import { HydrateExplorerSessions } from "@/lib/store/HydrateExplorerSessions"
import CommandBar from "@/lib/components/command/CommandBar"
import EntityPeekHost from "@/lib/components/entity/peek/EntityPeekHost"
import { getEntityDetails } from "@/lib/entityDetails"

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
					<HydrateExplorerSessions sessions={sessions} />
					<div className="relative flex flex-row">
						<Suspense>
							<Explorer sessions={sessions} vendors={vendors} categories={categories} />
						</Suspense>
						<div className="flex flex-col w-full min-w-0 ml-[var(--explorer-w)]">
							{/* below lg the Explorer rail is hidden, so the masthead rides above the page */}
							<SiteHeader compact className="pt-[calc(var(--commandbar-h)+0.5rem)] lg:hidden" />
							{/* top: room for the command bar; bottom: room for the status bar (0 off session pages) */}
							<main className="w-full min-w-0 px-4 pt-4 lg:p-8 lg:pt-[calc(var(--commandbar-h)+2rem)] pb-[calc(var(--statusbar-h)+2rem)] lg:pb-[calc(var(--statusbar-h)+2rem)]">
								{children}
							</main>
						</div>
					</div>
					<Suspense>
						<CommandBar
							sessions={sessions}
							vendors={vendors}
							categories={categories}
							details={entityDetails}
						/>
					</Suspense>
					{/* one EntityPeek card for every entity ref on the page (it reads filter params) */}
					<Suspense>
						<EntityPeekHost details={entityDetails} />
					</Suspense>
					<div className="fixed inset-0 z-50 pointer-events-none" id="portal-top-fixed" />
				</StoreProvider>
			</body>
		</html>
	)
}
