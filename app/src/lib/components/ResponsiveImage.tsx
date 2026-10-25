import type { ComponentProps } from "react"
import authoredImages from "@/generated/authoring-images.json"

export interface ResponsiveVariant {
	src: string
	mime: "image/webp"
	width: number
	height: number
}
const variantsByImage = authoredImages as Record<string, readonly ResponsiveVariant[]>

type ResponsiveImageProps = Omit<ComponentProps<"img">, "src"> & {
	src?: string | null
	alt: string
	variants?: readonly ResponsiveVariant[]
}

/**
 * Ordinary assets retain their exact img markup. Authored variants use a native picture;
 * display:contents preserves the existing image's layout, 3D cells, styles and event target.
 */
export default function ResponsiveImage({
	src,
	alt,
	sizes,
	variants: supplied,
	...props
}: ResponsiveImageProps) {
	const variants = supplied ?? (typeof src === "string" ? variantsByImage[src] : undefined)
	if (!variants?.length) {
		// eslint-disable-next-line @next/next/no-img-element
		return <img {...props} src={src ?? undefined} alt={alt} sizes={sizes} />
	}
	return (
		<picture style={{ display: "contents" }}>
			<source
				type="image/webp"
				srcSet={variants.map((variant) => variant.src + " " + variant.width + "w").join(", ")}
				sizes={sizes ?? "100vw"}
			/>
			<img {...props} src={src ?? undefined} alt={alt} sizes={sizes} />
		</picture>
	)
}
