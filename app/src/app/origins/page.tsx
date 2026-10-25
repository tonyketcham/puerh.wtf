import type { Metadata } from "next"
import OriginIndex from "@/lib/components/entity/indexes/OriginIndex"
import { getEntityList } from "@/lib/content/entities.server"
import { getMapPoints } from "@/lib/components/map/points"

export const metadata: Metadata = {
	title: "Origins · puerh.wtf",
	description:
		"Where the teas in the log grew: a contour map of every origin, and the tree from country to village.",
}

export default async function OriginsPage() {
	return <OriginIndex origins={await getEntityList("origin")} points={getMapPoints()} />
}
