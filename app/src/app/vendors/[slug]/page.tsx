import EntityPageServer from "@/lib/components/entity/page/EntityPageServer"
import {
	decodeSlug,
	entityMetadata,
	entityStaticParams,
	type SlugParams,
} from "@/lib/components/entity/page/routes"

export const dynamicParams = false

export async function generateStaticParams() {
	return entityStaticParams("vendor")
}

export async function generateMetadata(props: SlugParams) {
	return entityMetadata("vendor", props)
}

export default async function VendorPage({ params }: SlugParams) {
	const { slug } = await params
	return <EntityPageServer kind="vendor" slug={decodeSlug(slug)} />
}
