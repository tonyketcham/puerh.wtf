import { notFound } from "next/navigation"
import SteepGutter from "@/lib/components/session/SteepGutter"
import FlowAroundArticle from "@/lib/components/session/FlowAroundArticle"
import { infusionHtml } from "@/lib/session-journal.mjs"

export default function SessionJournalFixture() {
	if (process.env.NODE_ENV !== "development" && process.env.PUERH_TEST_FIXTURES !== "1") notFound()
	const infusions = [
		{ number: 1, duration_seconds: 15, note: "Honey and warm stone." },
		{ number: 3, duration_seconds: 25, note: "The third cup opens with jasmine." },
	]
	return (
		<div className="mx-auto max-w-3xl pl-12" data-recording-key="structured-journal-fixture">
			<h1>Structured steep notes</h1>
			<SteepGutter
				slug="structured-journal-fixture"
				brewing={{ first_infusion_duration: 10, infusion_increment: 10 }}
				infusions={infusions}
			>
				<FlowAroundArticle html={infusionHtml(infusions)} />
			</SteepGutter>
		</div>
	)
}
