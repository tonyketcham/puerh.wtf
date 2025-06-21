interface Heading2Props {
	children: React.ReactNode
	auxiliaryInfo?: React.ReactNode
}

export default function Heading2({ children, auxiliaryInfo }: Heading2Props) {
	return (
		<h2 className="py-5 text-6xl leading-tight font-rock-3d text-shadow-lg">
			{auxiliaryInfo}
			<span className="block -word-spacing-9" style={{ fontSize: "clamp(16px, 6vw, 60px)" }}>
				{children}
			</span>
		</h2>
	)
}
