"use client"

import "simplebar-react/dist/simplebar.min.css"
import Panel from "./Panel"
import type { PropsWithChildren } from "react"

/**
 * Fixed right "Properties" panel. Sits above the status bar (bottom inset = --statusbar-h)
 * and exposes [data-properties-panel] so :root can publish --rightpanel-w for centering
 * the command bar over the editor column.
 *
 * Below lg it joins the page flow under the editor as a full-width card at its natural height:
 * on a phone the page is the one scroller, so the panel's own SimpleBar stands down (app.css)
 * rather than trapping Source, Record and Notes in a box inside the page. From lg the aside
 * dissolves (contents) so its fixed card leaves no gap in the frame.
 */
export default function PropertiesPanel({ children }: PropsWithChildren<unknown>) {
	return (
		<aside data-properties-panel className="min-w-0 lg:contents">
			<Panel className="relative lg:fixed lg:top-0 lg:right-0 lg:bottom-[var(--statusbar-h)] lg:w-[var(--properties-w)] lg:p-5 2xl:p-8">
				{children}
			</Panel>
		</aside>
	)
}
