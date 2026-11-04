import type { Metadata } from "next"
import { pageMetadata } from "@/lib/siteMetadata"
import CultivarIndex from "@/lib/components/entity/indexes/CultivarIndex"
import { getEntityList } from "@/lib/content/entities.server"

export const metadata: Metadata = pageMetadata({
	title: "Cultivars · puerh.wtf",
	description: "Every cultivar in the tea log, with leaf size, sessions and the styles made from it.",
	path: "/cultivars/",
})

export default async function CultivarsPage() {
	return <CultivarIndex cultivars={await getEntityList("cultivar")} />
}
