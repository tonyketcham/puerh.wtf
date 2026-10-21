import EntityPageServer from "@/lib/components/entity/page/EntityPageServer"
import {
	decodeSlug,
	entityMetadata,
	entityStaticParams,
	type SlugParams,
} from "@/lib/components/entity/page/routes"

export const dynamicParams = false

export async function generateStaticParams() {
	return entityStaticParams("origin")
}

export async function generateMetadata(props: SlugParams) {
	return entityMetadata("origin", props)
}

export default async function OriginPage({ params }: SlugParams) {
	const { slug } = await params
	return <EntityPageServer kind="origin" slug={decodeSlug(slug)} />
}
