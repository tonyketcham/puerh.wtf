import type { Metadata } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import "../app.css"
import Explorer from "../lib/components/Explorer"
import { getExplorerSessions, getVendors, getCategories } from "@/lib/api"
import GenreLegend from "@/lib/components/GenreLegend"
import { Toolbar } from "@/lib/components/containers/Toolbar"
import { StoreProvider } from "@/lib/store/StoreProvider"

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
	const sessions = await getExplorerSessions()
	const vendors = await getVendors()
	const categories = await getCategories()

	return (
		<html lang="en">
			<body className={`${inter.variable} ${firaCode.variable} ${rock3d.variable}`}>
				<StoreProvider>
					<div className="relative flex flex-row">
						<Explorer sessions={sessions} vendors={vendors} categories={categories} />
						<div className="flex flex-col w-full ml-[340px]">
							<main className="w-full p-8">{children}</main>
						</div>
						<Toolbar>
							<GenreLegend categories={categories} />
						</Toolbar>
					</div>
					<div className="fixed inset-0 z-50 pointer-events-none" id="portal-top-fixed" />
				</StoreProvider>
			</body>
		</html>
	)
}
