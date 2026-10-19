import SessionProperties, { SessionPropertiesPanel } from "@/lib/components/SessionProperties"
import StatusBar from "@/lib/components/session/StatusBar"
import SessionBreadcrumb from "@/lib/components/session/SessionBreadcrumb"
import type { PropsWithChildren } from "react"

export default async function SessionLayout({ children }: PropsWithChildren) {
	return (
		// [data-statusbar-layout] turns on --statusbar-h (see app.css)
		<div className="flex-1 bg-background text-ink" data-statusbar-layout>
			<div className="grid grid-cols-12 gap-8 p-8">
				<div className="col-span-8">
					{/* persists across sessions, so shared crumbs hold still while the tail changes */}
					<SessionBreadcrumb className="mb-4" recordingKey="session-breadcrumb" />
					<div className="space-y-8">{children}</div>
				</div>

				<SessionPropertiesPanel>
					<SessionProperties />
				</SessionPropertiesPanel>
			</div>

			<StatusBar />
		</div>
	)
}
