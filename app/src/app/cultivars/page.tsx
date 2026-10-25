import type { Metadata } from "next"
import CultivarIndex from "@/lib/components/entity/indexes/CultivarIndex"
import { getEntityList } from "@/lib/content/entities.server"

export const metadata: Metadata = {
	title: "Cultivars · puerh.wtf",
	description:
		"Every cultivar in the tea log, with leaf size, sessions and the styles made from it.",
}

export default async function CultivarsPage() {
	return <CultivarIndex cultivars={await getEntityList("cultivar")} />
}
