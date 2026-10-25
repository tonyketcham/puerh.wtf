import AuthoringPage from "@/lib/authoring/AuthoringPage"
export const metadata = {
	title: "Working changes · puerh.wtf",
	robots: { index: false, follow: false },
}
export default function Page() {
	return <AuthoringPage view="working" />
}
