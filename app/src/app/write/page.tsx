import { Suspense } from "react"
import AuthoringPage from "@/lib/authoring/AuthoringPage"
export const metadata = { title: "Write · puerh.wtf", robots: { index: false, follow: false } }
export default function Page() {
	return (
		<Suspense>
			<AuthoringPage view="write" />
		</Suspense>
	)
}
