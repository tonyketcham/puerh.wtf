import Link from "next/link"
import Github from "./icons/Github"
import Instagram from "./icons/Instagram"

export default function SiteHeader() {
	return (
		<header className="flex flex-row justify-between px-4 py-1 font-display">
			<Link href="/" aria-label="home" className="pointer-events-auto">
				<h1 className="text-6xl leading-[3.25rem] text-bai-cha-100 select-none drop-shadow-split">
					<span>puerh</span>
					<br />
					<span className="block -ml-4">.wtf</span>
				</h1>
			</Link>

			<div className="flex flex-col space-y-1.5 m-auto pt-4 opacity-80">
				<a
					aria-label="source code"
					href="https://github.com/tonyketcham/puerh.wtf"
					className="w-5 h-5 outline-none focus:outline-none hover:text-tea-soup-500 focus:text-tea-soup-500 pointer-events-auto"
				>
					<Github />
				</a>

				<a
					aria-label="puerh.wtf instagram"
					href="https://instagram.com/puerh.wtf/"
					className="w-5 h-5 outline-none focus:outline-none hover:text-tea-soup-500 focus:text-tea-soup-500 pointer-events-auto"
				>
					<Instagram />
				</a>
			</div>
		</header>
	)
}
