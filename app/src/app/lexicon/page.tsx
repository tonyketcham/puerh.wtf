import type { Metadata } from "next"
import { pageMetadata } from "@/lib/siteMetadata"
import LexiconIndex from "./_components/LexiconIndex"

export const metadata: Metadata = pageMetadata({
	title: "Lexicon · puerh.wtf",
	description: "Every word the tasting notes use, sized by how often it turns up and grouped into the ten flavor axes.",
	path: "/lexicon/",
})

export default function LexiconPage() {
	return <LexiconIndex />
}
