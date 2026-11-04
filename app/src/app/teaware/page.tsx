import type { Metadata } from "next"
import { pageMetadata } from "@/lib/siteMetadata"
import VesselIndex from "@/lib/components/entity/indexes/VesselIndex"
import { getEntityList } from "@/lib/content/entities.server"

export const metadata: Metadata = pageMetadata({
	title: "Teaware · puerh.wtf",
	description: "Every gaiwan, pot and pouring bowl in the tea log: what each holds, how it gets brewed and when it was in rotation.",
	path: "/teaware/",
})

export default async function TeawarePage() {
	return <VesselIndex vessels={await getEntityList("vessel")} />
}
