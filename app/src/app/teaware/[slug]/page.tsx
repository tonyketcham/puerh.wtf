import EntityPageServer from "@/lib/components/entity/page/EntityPageServer"
import {
	decodeSlug,
	entityMetadata,
	entityStaticParams,
	type SlugParams,
} from "@/lib/components/entity/page/routes"

export const dynamicParams = false

export async function generateStaticParams() {
	return entityStaticParams("vessel")
}

export async function generateMetadata(props: SlugParams) {
	return entityMetadata("vessel", props)
}

export default async function VesselPage({ params }: SlugParams) {
	const { slug } = await params
	return <EntityPageServer kind="vessel" slug={decodeSlug(slug)} />
}
