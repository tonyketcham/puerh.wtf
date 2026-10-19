import type { Metadata } from "next"
import VesselIndex from "@/lib/components/entity/indexes/VesselIndex"
import { getEntityList } from "@/lib/components/entity/page/data"

export const metadata: Metadata = {
	title: "Teaware · puerh.wtf",
	description:
		"Every gaiwan, pot and pouring bowl in the tea log: what each holds, how it gets brewed and when it was in rotation.",
}

export default async function TeawarePage() {
	return <VesselIndex vessels={await getEntityList("vessel")} />
}
