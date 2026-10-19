import type { Metadata } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import "../app.css"
import Explorer from "../lib/components/Explorer"
import { getExplorerSessions, getVendors, getCategories } from "@/lib/api"
import { StoreProvider } from "@/lib/store/StoreProvider"
import { Suspense } from "react"
import { HydrateExplorerSessions } from "@/lib/store/HydrateExplorerSessions"
import CommandBar from "@/lib/components/command/CommandBar"

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
	const [sessions, vendors, categories] = await Promise.all([
		getExplorerSessions(),
		getVendors(),
		getCategories(),
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
						<div className="flex flex-col w-full ml-[var(--explorer-w)]">
							{/* top: room for the command bar; bottom: room for the status bar (0 off session pages) */}
							<main className="w-full p-8 pt-[calc(var(--commandbar-h)+2rem)] pb-[calc(var(--statusbar-h)+2rem)]">
								{children}
							</main>
						</div>
					</div>
					<Suspense>
						<CommandBar sessions={sessions} vendors={vendors} categories={categories} />
					</Suspense>
					<div className="fixed inset-0 z-50 pointer-events-none" id="portal-top-fixed" />
				</StoreProvider>
			</body>
		</html>
	)
}
