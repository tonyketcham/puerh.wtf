import EntityPageServer from "@/lib/components/entity/page/EntityPageServer"
import {
	decodeSlug,
	entityMetadata,
	entityStaticParams,
	type SlugParams,
} from "@/lib/components/entity/page/routes"

export const dynamicParams = false

export async function generateStaticParams() {
	return entityStaticParams("category")
}

export async function generateMetadata(props: SlugParams) {
	return entityMetadata("category", props)
}

export default async function CategoryPage({ params }: SlugParams) {
	const { slug } = await params
	return <EntityPageServer kind="category" slug={decodeSlug(slug)} />
}
