import EntityPageServer from "@/lib/components/entity/page/EntityPageServer"
import {
	decodeSlug,
	entityMetadata,
	entityStaticParams,
	type SlugParams,
} from "@/lib/components/entity/page/routes"

export const dynamicParams = false

export async function generateStaticParams() {
	return entityStaticParams("style")
}

export async function generateMetadata(props: SlugParams) {
	return entityMetadata("style", props)
}

export default async function StylePage({ params }: SlugParams) {
	const { slug } = await params
	return <EntityPageServer kind="style" slug={decodeSlug(slug)} />
}
