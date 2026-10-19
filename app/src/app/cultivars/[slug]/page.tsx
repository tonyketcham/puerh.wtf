import EntityPageServer from "@/lib/components/entity/page/EntityPageServer"
import {
	decodeSlug,
	entityMetadata,
	entityStaticParams,
	type SlugParams,
} from "@/lib/components/entity/page/routes"

export const dynamicParams = false

export async function generateStaticParams() {
	return entityStaticParams("cultivar")
}

export async function generateMetadata(props: SlugParams) {
	return entityMetadata("cultivar", props)
}

export default async function CultivarPage({ params }: SlugParams) {
	const { slug } = await params
	return <EntityPageServer kind="cultivar" slug={decodeSlug(slug)} />
}
