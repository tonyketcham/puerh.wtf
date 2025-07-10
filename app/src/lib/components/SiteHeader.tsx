import Link from "next/link"
import Github from "./icons/Github"
import Instagram from "./icons/Instagram"

export default function SiteHeader() {
	return (
		<header className="flex flex-row justify-between px-4 py-1 font-rock-3d">
			<Link href="/" aria-label="home" className="pointer-events-auto">
				<h1 className="text-[64px] leading-[3.25rem] text-bai-cha-100 select-none drop-shadow-split">
					<span>puerh</span>
					<br />
					<span className="block -ml-4">.wtf</span>
				</h1>
			</Link>

			<div className="flex flex-col m-auto space-y-1.5 pt-4 opacity-80 text-white">
				<a
					aria-label="source code"
					href="https://github.com/tonyketcham/puerh.wtf"
					className="w-6 outline-none pointer-events-auto focus:outline-none"
				>
					<Github />
				</a>

				<a
					aria-label="puerh.wtf instagram"
					href="https://instagram.com/puerh.wtf/"
					className="w-6 outline-none pointer-events-auto focus:outline-none"
				>
					<Instagram />
				</a>
			</div>
		</header>
	)
}
