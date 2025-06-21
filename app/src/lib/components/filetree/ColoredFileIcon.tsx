interface ColoredFileIconProps {
	color?: string
}

export default function ColoredFileIcon({ color = "white" }: ColoredFileIconProps) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="mt-0.5 w-4 h-4 text-bai-cha-50 flex-shrink-0"
			style={{ color }}
		>
			<path
				d="M3.96327 2.66668V13.3333C3.96327 13.687 4.10375 14.0261 4.3538 14.2762C4.60384 14.5262 4.94298 14.6667 5.29661 14.6667H13.2966C13.6502 14.6667 13.9894 14.5262 14.2394 14.2762C14.4895 14.0261 14.6299 13.687 14.6299 13.3333V5.56134C14.6299 5.38372 14.5944 5.20788 14.5255 5.04417C14.4566 4.88046 14.3556 4.73217 14.2286 4.60801L11.2686 1.71334C11.0195 1.46978 10.685 1.33339 10.3366 1.33334H5.29661C4.94298 1.33334 4.60384 1.47382 4.3538 1.72387C4.10375 1.97392 3.96327 2.31305 3.96327 2.66668V2.66668Z"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.29663 8H11.2966"
				stroke="white"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.29663 11.3333H9.29663"
				stroke="white"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M10.63 1.66666V3.99999C10.63 4.35361 10.7704 4.69275 11.0205 4.9428C11.2705 5.19285 11.6097 5.33332 11.9633 5.33332H14.2629"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}
