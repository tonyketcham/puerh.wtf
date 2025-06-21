export default function PartitionedDivider() {
	return (
		<div className="flex flex-row justify-between space-x-3">
			{Array.from({ length: 2 }).map((_, index) => (
				<div key={index} className="w-1/4 h-0.5 rounded-xl bg-heicha-700/40" />
			))}
		</div>
	)
}
