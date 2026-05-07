declare module "simplebar-react" {
	import * as React from "react"
	import type SimpleBarCore from "simplebar-core"
	import type { SimpleBarOptions } from "simplebar-core"

	type RenderFunc = (props: {
		scrollableNodeRef: React.MutableRefObject<HTMLElement | undefined>
		scrollableNodeProps: {
			className: string
			ref: React.MutableRefObject<HTMLElement | undefined>
		}
		contentNodeRef: React.MutableRefObject<HTMLElement | undefined>
		contentNodeProps: {
			className: string
			ref: React.MutableRefObject<HTMLElement | undefined>
		}
	}) => React.ReactNode

	export interface Props
		extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
			SimpleBarOptions {
		children?: React.ReactNode | RenderFunc
		scrollableNodeProps?: {
			ref?: unknown
			className?: string
			[key: string]: unknown
		}
	}

	const SimpleBar: React.ForwardRefExoticComponent<
		Props & React.RefAttributes<SimpleBarCore | null>
	>
	export default SimpleBar
}
