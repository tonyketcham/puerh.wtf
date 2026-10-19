import type { ReactNode } from "react"
import { SessionPropertiesPanel } from "@/lib/components/SessionProperties"
import { cn } from "@/lib/utils/cn"

/**
 * The editor column every shell shares (sessions, entities, lexicon). Main already pads by
 * the fixed panels' widths (app.css), so the column takes what is left; a document with a
 * Properties panel caps at --editor-max and centers, an index runs the full width.
 *
 * The column is the `editor` size container: page parts switch layout on its width
 * (@lg/editor:…), which tracks the panels, rather than on the viewport, which doesn't.
 *
 * Below lg the panel joins the flow under the column; from lg it is fixed to the right.
 * xl:pl-8 keeps room for the steep gutter that hangs left of the column once the Explorer
 * is docked.
 */
export default function EditorFrame({
	panel,
	children,
}: {
	panel?: ReactNode
	children: ReactNode
}) {
	return (
		<div className="flex flex-col gap-10 lg:py-8 xl:pl-8">
			<div
				className={cn(
					"@container/editor min-w-0 w-full",
					panel && "mx-auto max-w-(--editor-max)"
				)}
			>
				{children}
			</div>

			{panel && <SessionPropertiesPanel>{panel}</SessionPropertiesPanel>}
		</div>
	)
}
