import type { Metadata } from "next"
import VendorIndex from "@/lib/components/entity/indexes/VendorIndex"
import { getEntityList, getOriginPoints, getServerIndex } from "@/lib/components/entity/page/data"
import type { DotMapPoint } from "@/lib/components/entity/page/DotMap"
import { related } from "@/lib/relations"

export const metadata: Metadata = {
	title: "Vendors · puerh.wtf",
	description: "Every vendor in the tea log, by sessions, with the origins they source from.",
}

export default async function VendorsPage() {
	const [vendors, index, origins] = await Promise.all([
		getEntityList("vendor"),
		getServerIndex(),
		getOriginPoints(),
	])

	// where each vendor's teas grew, as dots (the client has no coordinates)
	const points: Record<string, DotMapPoint[]> = {}
	for (const v of vendors) {
		if (!index.nodes.vendor.has(v.slug)) continue
		points[v.slug] = related(index, "vendor", v.slug, "origin", { rollup: false })
			.map(({ node, count }) => {
				const p = origins[node.slug]
				return p ? { slug: p.slug, title: p.title, lat: p.lat, lon: p.lon, count } : null
			})
			.filter((p): p is NonNullable<typeof p> => !!p)
	}

	return <VendorIndex vendors={vendors} points={points} />
}
