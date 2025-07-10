export function Toolbar({ children }: { children: React.ReactNode }) {
	return (
		<nav className="fixed left-0 right-0 z-30 grid bottom-8 place-content-center">
			<div className="px-1.5 py-1 border bg-heicha-700/80 backdrop-blur-xl border-heicha-500/50 rounded-2xl">
				{children}
			</div>
		</nav>
	)
}
