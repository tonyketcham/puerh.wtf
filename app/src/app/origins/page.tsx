import type { Metadata } from "next"
import OriginIndex from "@/lib/components/entity/indexes/OriginIndex"
import { getEntityList } from "@/lib/components/entity/page/data"

export const metadata: Metadata = {
	title: "Origins · puerh.wtf",
	description: "Where the teas in the log grew: the origin tree, country to village.",
}

export default async function OriginsPage() {
	return <OriginIndex origins={await getEntityList("origin")} />
}
