interface TeaStyleBadgeProps {
	color: string
	title: string
}

export default function TeaStyleBadge({ color, title }: TeaStyleBadgeProps) {
	return (
		<div className="flex flex-row justify-end space-x-2 place-items-center">
			{color && (
				<div className="flex-shrink-0">
					<div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
				</div>
			)}
			<span className="flex-shrink">{title}</span>
		</div>
	)
}
