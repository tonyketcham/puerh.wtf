import SessionProperties, { SessionPropertiesPanel } from "@/lib/components/SessionProperties"
import type { PropsWithChildren } from "react"

export default async function SessionLayout({ children }: PropsWithChildren) {
	return (
		<main className="flex-1 bg-background text-ink">
			<div className="grid grid-cols-12 gap-8 p-8">
				<div className="col-span-8 space-y-8">{children}</div>

				<SessionPropertiesPanel>
					<SessionProperties />
				</SessionPropertiesPanel>
			</div>
		</main>
	)
}
