import type { Metadata } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import "../app.css"
import NavSidebar from "@/lib/components/NavSidebar"
import { getSessions, getVendors, getCategories } from "@/lib/api"

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
	const sessions = await getSessions()
	const vendors = await getVendors()
	const categories = await getCategories()

	return (
		<html lang="en">
			<body className={`${inter.variable} ${firaCode.variable} ${rock3d.variable}`}>
				<div className="relative flex flex-row">
					<NavSidebar sessions={sessions} vendors={vendors} categories={categories} />
					<main className="ml-[340px] w-full">{children}</main>
				</div>
			</body>
		</html>
	)
}
