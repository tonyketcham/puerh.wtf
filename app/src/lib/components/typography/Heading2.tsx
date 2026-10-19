interface Heading2Props {
	children: React.ReactNode
	auxiliaryInfo?: React.ReactNode
}

export default function Heading2({ children, auxiliaryInfo }: Heading2Props) {
	return (
		<h2 className="py-5 text-6xl leading-tight font-rock-3d text-shadow-lg">
			{auxiliaryInfo}
			{/* font-rock-3d word spacing resolved at the h2 size; re-resolve it at the clamped size */}
			<span className="block" style={{ fontSize: "clamp(40px, 6vw, 60px)", wordSpacing: "-0.6em" }}>
				{children}
			</span>
		</h2>
	)
}
