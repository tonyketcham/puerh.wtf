import type { Metadata } from "next"
import StyleIndex from "@/lib/components/entity/indexes/StyleIndex"
import { getEntityList } from "@/lib/content/entities.server"

export const metadata: Metadata = {
	title: "Styles · puerh.wtf",
	description: "Every style in the tea log, banded by category, tasted or not.",
}

export default async function StylesPage() {
	const [categories, styles] = await Promise.all([
		getEntityList("category"),
		getEntityList("style"),
	])
	return <StyleIndex categories={categories} styles={styles} />
}
