"use client"
import dynamic from "next/dynamic"
const Working = dynamic(() => import("./WorkingWorkspace"), {
	ssr: false,
	loading: () => <p className="cms-muted">Opening your notebook…</p>,
})
const Write = dynamic(() => import("./WriteWorkspace"), {
	ssr: false,
	loading: () => <p className="cms-muted">Opening your draft…</p>,
})
export default function AuthoringPage({ view }: { view: "working" | "write" }) {
	return view === "working" ? <Working /> : <Write />
}
