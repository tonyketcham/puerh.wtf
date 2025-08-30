"use client"

import React, {
	forwardRef,
	memo,
	ReactNode,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react"
import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
	ValueAnimationOptions,
} from "motion/react"

import { cn } from "@/lib/utils"

interface CarouselItem {
	/**
	 * Unique identifier for the carousel item
	 */
	id: string
	/**
	 * The type of media: "image" or "video"
	 */
	type: "image" | "video"
	/**
	 * Source URL for the image or video
	 */
	src: string
	/**
	 * (Optional) Alternative text for images
	 */
	alt?: string
	/**
	 * (Optional) Poster image for videos (displayed before playback)
	 */
	poster?: string
}

/**
 * Props for a single face of the cube in the BoxCarousel.
 */
interface FaceProps {
	/**
	 * The CSS transform string to position and rotate the face in 3D space.
	 */
	transform: string
	/**
	 * Optional additional CSS class names for the face.
	 */
	className?: string
	/**
	 * Optional React children to render inside the face.
	 */
	children?: ReactNode
	/**
	 * Optional inline styles for the face.
	 */
	style?: React.CSSProperties
	/**
	 * If true, enables debug mode (e.g., shows backface and opacity).
	 */
	debug?: boolean
}

const CubeFace = memo(({ transform, className, children, style, debug }: FaceProps) => (
	<div
		className={cn("absolute overflow-hidden", debug && "backface-visible opacity-50", className)}
		style={{ transform, ...style }}
	>
		{children}
	</div>
))

CubeFace.displayName = "CubeFace"

const MediaRenderer = memo(
	({
		item,
		className,
		debug = false,
	}: {
		item: CarouselItem
		className?: string
		debug?: boolean
	}) => {
		if (!debug) {
			if (item.type === "video") {
				return (
					<video
						src={item.src}
						poster={item.poster}
						className={cn("object-cover w-full h-full", className)}
						muted
						loop
						autoPlay
					/>
				)
			}

			return (
				<img
					src={item.src}
					alt={item.alt || ""}
					draggable={false}
					className={cn("object-cover w-full h-full border-2 border-yellow-400", className)}
				/>
			)
		}

		return (
			<div
				className={cn("flex items-center justify-center w-full h-full text-2xl border", className)}
			>
				{item.id}
			</div>
		)
	}
)

MediaRenderer.displayName = "MediaRenderer"

export interface BoxCarouselRef {
	/**
	 * Advance to the next item in the carousel.
	 */
	next: () => void

	/**
	 * Go back to the previous item in the carousel.
	 */
	prev: () => void

	/**
	 * Get the index of the currently visible item.
	 */
	getCurrentItemIndex: () => number
}

type RotationDirection = "top" | "bottom" | "left" | "right"

interface SpringConfig {
	stiffness?: number
	damping?: number
	mass?: number
}

/**
 * Props for the BoxCarousel component
 */
interface BoxCarouselProps extends React.HTMLProps<HTMLDivElement> {
	/**
	 * Array of items to display in the carousel
	 */
	items: CarouselItem[]

	/**
	 * Width of the carousel in pixels
	 */
	width: number

	/**
	 * Height of the carousel in pixels
	 */
	height: number

	/**
	 * Additional CSS classes for the container
	 */
	className?: string

	/**
	 * Enable debug mode (shows extra info/overlays)
	 */
	debug?: boolean

	/**
	 * Perspective value for 3D effect (in px)
	 * @default 600
	 */
	perspective?: number

	/**
	 * The axis and direction of rotation
	 * @default "vertical"
	 * "top" | "bottom" | "left" | "right"
	 */
	direction?: RotationDirection

	/**
	 * Transition configuration for rotation animation
	 * @default { duration: 1.25, ease: [0.953, 0.001, 0.019, 0.995] }
	 */
	transition?: ValueAnimationOptions

	/**
	 * Transition configuration for snapping after drag
	 * @default { type: "spring", damping: 30, stiffness: 200 }
	 */
	snapTransition?: ValueAnimationOptions

	/**
	 * Spring physics config for drag interaction
	 * @default { stiffness: 200, damping: 30 }
	 */
	dragSpring?: SpringConfig

	/**
	 * Enable auto-play mode
	 * @default false
	 */
	autoPlay?: boolean

	/**
	 * Interval (ms) between auto-play transitions
	 * @default 3000
	 */
	autoPlayInterval?: number

	/**
	 * Enable continuous rotation (smooth, infinite rotation)
	 * Takes precedence over autoPlay if both are enabled
	 * @default false
	 */
	continuousRotation?: boolean

	/**
	 * Speed of continuous rotation in degrees per second
	 * Positive values rotate in the direction specified by `direction`
	 * Negative values rotate in the opposite direction
	 * @default 30
	 */
	continuousSpeed?: number

	/**
	 * Pause continuous rotation on hover
	 * @default true
	 */
	pauseOnHover?: boolean

	/**
	 * Pause continuous rotation during drag interaction
	 * @default true
	 */
	pauseOnDrag?: boolean

	/**
	 * Callback when the current item index changes
	 */
	onIndexChange?: (index: number) => void

	/**
	 * Enable drag interaction
	 * @default true
	 */
	enableDrag?: boolean

	/**
	 * Sensitivity of drag (higher = more rotation per pixel)
	 * @default 0.5
	 */
	dragSensitivity?: number
}

const BoxCarousel = forwardRef<BoxCarouselRef, BoxCarouselProps>(
	(
		{
			items,
			width,
			height,
			className,
			perspective = 600,
			debug = false,
			direction = "left",
			transition = { duration: 1.25, ease: [0.953, 0.001, 0.019, 0.995] },
			snapTransition = { type: "spring", damping: 30, stiffness: 200 },
			dragSpring = { stiffness: 200, damping: 30 },
			autoPlay = false,
			autoPlayInterval = 3000,
			continuousRotation = false,
			continuousSpeed = 30,
			pauseOnHover = true,
			pauseOnDrag = true,
			onIndexChange,
			enableDrag = true,
			dragSensitivity = 0.5,
			...props
		},
		ref
	) => {
		const [currentItemIndex, setCurrentItemIndex] = useState(0)
		const [currentFrontFaceIndex, setCurrentFrontFaceIndex] = useState(1)

		const prefersReducedMotion = useReducedMotion()

		const _transition = prefersReducedMotion ? { duration: 0 } : transition

		// 0 ⇢ will be shown if the user presses "prev"
		const [prevIndex, setPrevIndex] = useState(items.length - 1)

		// 1 ⇢ item that is currently visible
		const [currentIndex, setCurrentIndex] = useState(0)

		// 2 ⇢ will be shown on the next "next"
		const [nextIndex, setNextIndex] = useState(1)

		// 3 ⇢ two steps ahead (the face that is at the back right now)
		const [afterNextIndex, setAfterNextIndex] = useState(2)

		const [currentRotation, setCurrentRotation] = useState(0)
		const [isHovered, setIsHovered] = useState(false)

		const rotationCount = useRef(1)
		const isRotating = useRef(false)
		const pendingIndexChange = useRef<number | null>(null)
		const isDragging = useRef(false)
		const startPosition = useRef({ x: 0, y: 0 })
		const startRotation = useRef(0)
		const continuousAnimationRef = useRef<{ stop: () => void } | null>(null)
		const lastUpdateTime = useRef<number>(0)

		const baseRotateX = useMotionValue(0)
		const baseRotateY = useMotionValue(0)

		// Use springs for smoother animation during drag
		const springRotateX = useSpring(baseRotateX, dragSpring)
		const springRotateY = useSpring(baseRotateY, dragSpring)

		// Continuous rotation helper functions
		const shouldPauseContinuous = useCallback(() => {
			return (
				(pauseOnHover && isHovered) ||
				(pauseOnDrag && isDragging.current) ||
				isRotating.current ||
				prefersReducedMotion
			)
		}, [pauseOnHover, isHovered, pauseOnDrag, prefersReducedMotion])

		const startContinuousRotation = useCallback(() => {
			if (!continuousRotation || shouldPauseContinuous()) return

			// Stop any existing animation
			if (continuousAnimationRef.current) {
				continuousAnimationRef.current.stop()
			}

			lastUpdateTime.current = performance.now()

			const isVertical = direction === "top" || direction === "bottom"
			const targetMotionValue = isVertical ? baseRotateX : baseRotateY

			// Calculate rotation direction multiplier
			let directionMultiplier = 1
			if (direction === "top" || direction === "left") {
				directionMultiplier = -1
			}

			// Store the starting rotation to track progress
			const startingRotation = targetMotionValue.get()
			let lastTrackedQuarter = Math.floor((((startingRotation % 360) + 360) % 360) / 90)

			const animateFrame = () => {
				const currentTime = performance.now()
				const deltaTime = (currentTime - lastUpdateTime.current) / 1000 // Convert to seconds
				lastUpdateTime.current = currentTime

				if (shouldPauseContinuous()) {
					return
				}

				const currentValue = targetMotionValue.get()
				const rotationIncrement = continuousSpeed * directionMultiplier * deltaTime
				const newValue = currentValue + rotationIncrement

				targetMotionValue.set(newValue)

				// Update current rotation for tracking
				setCurrentRotation(newValue)

				// Check if we've completed a full 90-degree rotation to update indices
				const normalizedNewValue = ((newValue % 360) + 360) % 360
				const newQuarter = Math.floor(normalizedNewValue / 90)

				if (newQuarter !== lastTrackedQuarter) {
					// Calculate how many quarters we've moved
					let quarterDiff = newQuarter - lastTrackedQuarter

					// Handle wrapping around 0/360
					if (quarterDiff > 2) {
						quarterDiff -= 4
					} else if (quarterDiff < -2) {
						quarterDiff += 4
					}

					// Update item index based on quarter movement
					const indexChange = quarterDiff * directionMultiplier

					let newItemIndex = currentItemIndex
					for (let i = 0; i < Math.abs(indexChange); i++) {
						if (indexChange > 0) {
							newItemIndex = (newItemIndex + 1) % items.length
						} else {
							newItemIndex = newItemIndex === 0 ? items.length - 1 : newItemIndex - 1
						}
					}

					if (newItemIndex !== currentItemIndex) {
						setCurrentItemIndex(newItemIndex)
						onIndexChange?.(newItemIndex)
					}

					lastTrackedQuarter = newQuarter
				}

				requestAnimationFrame(animateFrame)
			}

			const initialFrame = requestAnimationFrame(animateFrame)

			continuousAnimationRef.current = {
				stop: () => {
					cancelAnimationFrame(initialFrame)
				},
			}
		}, [
			continuousRotation,
			continuousSpeed,
			direction,
			shouldPauseContinuous,
			baseRotateX,
			baseRotateY,
			currentItemIndex,
			items.length,
			onIndexChange,
		])

		const stopContinuousRotation = useCallback(() => {
			if (continuousAnimationRef.current) {
				continuousAnimationRef.current.stop()
				continuousAnimationRef.current = null
			}
		}, [])

		const handleAnimationComplete = useCallback(
			(triggeredBy: string) => {
				if (isRotating.current && pendingIndexChange.current !== null) {
					isRotating.current = false

					let newFrontFaceIndex: number
					let currentBackFaceIndex: number

					if (triggeredBy === "next") {
						newFrontFaceIndex = (currentFrontFaceIndex + 1) % 4
						currentBackFaceIndex = (newFrontFaceIndex + 2) % 4
					} else {
						newFrontFaceIndex = (currentFrontFaceIndex - 1 + 4) % 4
						currentBackFaceIndex = (newFrontFaceIndex + 3) % 4
					}

					setCurrentItemIndex(pendingIndexChange.current)
					onIndexChange?.(pendingIndexChange.current)

					const indexOffset = triggeredBy === "next" ? 2 : -1

					if (currentBackFaceIndex === 0) {
						setPrevIndex((pendingIndexChange.current + indexOffset + items.length) % items.length)
					} else if (currentBackFaceIndex === 1) {
						setCurrentIndex(
							(pendingIndexChange.current + indexOffset + items.length) % items.length
						)
					} else if (currentBackFaceIndex === 2) {
						setNextIndex((pendingIndexChange.current + indexOffset + items.length) % items.length)
					} else if (currentBackFaceIndex === 3) {
						setAfterNextIndex(
							(pendingIndexChange.current + indexOffset + items.length) % items.length
						)
					}

					pendingIndexChange.current = null
					rotationCount.current++

					setCurrentFrontFaceIndex(newFrontFaceIndex)
				}
			},
			[currentFrontFaceIndex, items.length, onIndexChange]
		)

		// Drag functionality - using direct event handlers like css-box
		const handleDragStart = useCallback(
			(e: React.MouseEvent | React.TouchEvent) => {
				if (!enableDrag || isRotating.current) return

				isDragging.current = true
				const point = "touches" in e ? e.touches[0] : e
				startPosition.current = { x: point.clientX, y: point.clientY }

				// Get the actual current rotation value from motion values for accurate drag start
				const isVertical = direction === "top" || direction === "bottom"
				const currentMotionValue = isVertical ? baseRotateX.get() : baseRotateY.get()
				startRotation.current = currentMotionValue

				// Stop continuous rotation during drag
				if (continuousRotation && pauseOnDrag) {
					stopContinuousRotation()
				}

				// Prevent default to avoid text selection
				e.preventDefault()
			},
			[
				enableDrag,
				direction,
				baseRotateX,
				baseRotateY,
				continuousRotation,
				pauseOnDrag,
				stopContinuousRotation,
			]
		)

		const handleDragMove = useCallback(
			(e: MouseEvent | TouchEvent) => {
				if (!isDragging.current || isRotating.current) return

				const point = "touches" in e ? e.touches[0] : e
				const deltaX = point.clientX - startPosition.current.x
				const deltaY = point.clientY - startPosition.current.y

				const isVertical = direction === "top" || direction === "bottom"
				const delta = isVertical ? deltaY : deltaX
				const rotationDelta = (delta * dragSensitivity) / 2

				let newRotation = startRotation.current

				if (direction === "top" || direction === "right") {
					newRotation += rotationDelta
				} else {
					newRotation -= rotationDelta
				}

				// Constrain rotation to ±120 degrees from start position. Otherwise the index recalculation will be off. TBD - find a better solution
				const minRotation = startRotation.current - 120
				const maxRotation = startRotation.current + 120
				newRotation = Math.max(minRotation, Math.min(maxRotation, newRotation))

				// Apply the rotation immediately during drag
				if (isVertical) {
					baseRotateX.set(newRotation)
				} else {
					baseRotateY.set(newRotation)
				}
			},
			[enableDrag, direction, dragSensitivity]
		)

		const handleDragEnd = useCallback(() => {
			if (!isDragging.current) return

			isDragging.current = false

			const isVertical = direction === "top" || direction === "bottom"
			const currentValue = isVertical ? baseRotateX.get() : baseRotateY.get()

			// Calculate the nearest quarter rotation (90-degree increment)
			const quarterRotations = Math.round(currentValue / 90)
			const snappedRotation = quarterRotations * 90

			// Calculate how many steps we've moved from the drag start position
			const rotationDifference = snappedRotation - startRotation.current
			const steps = Math.round(rotationDifference / 90)

			if (steps !== 0) {
				isRotating.current = true

				// Calculate new item index based on steps from current position
				let newItemIndex = currentItemIndex
				for (let i = 0; i < Math.abs(steps); i++) {
					if (steps > 0) {
						newItemIndex = (newItemIndex + 1) % items.length
					} else {
						newItemIndex = newItemIndex === 0 ? items.length - 1 : newItemIndex - 1
					}
				}

				pendingIndexChange.current = newItemIndex

				// Animate to the snapped position
				const targetMotionValue = isVertical ? baseRotateX : baseRotateY
				animate(targetMotionValue, snappedRotation, {
					...snapTransition,
					onComplete: () => {
						handleAnimationComplete(steps > 0 ? "next" : "prev")
						setCurrentRotation(snappedRotation)

						// Restart continuous rotation after drag ends if enabled
						if (continuousRotation) {
							// Use a small delay and ensure we restart from clean state
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			} else {
				// Snap back to nearest quarter rotation
				const targetMotionValue = isVertical ? baseRotateX : baseRotateY
				animate(targetMotionValue, snappedRotation, {
					...snapTransition,
					onComplete: () => {
						setCurrentRotation(snappedRotation)

						// Restart continuous rotation after drag ends if enabled
						if (continuousRotation) {
							// Use a small delay and ensure we restart from clean state
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			}
		}, [
			direction,
			baseRotateX,
			baseRotateY,
			currentItemIndex,
			items.length,
			snapTransition,
			handleAnimationComplete,
			continuousRotation,
			startContinuousRotation,
		])

		// Set up global event listeners for drag
		useEffect(() => {
			if (enableDrag) {
				window.addEventListener("mousemove", handleDragMove)
				window.addEventListener("mouseup", handleDragEnd)
				window.addEventListener("touchmove", handleDragMove)
				window.addEventListener("touchend", handleDragEnd)

				return () => {
					window.removeEventListener("mousemove", handleDragMove)
					window.removeEventListener("mouseup", handleDragEnd)
					window.removeEventListener("touchmove", handleDragMove)
					window.removeEventListener("touchend", handleDragEnd)
				}
			}
		}, [enableDrag, handleDragMove, handleDragEnd])

		const next = useCallback(() => {
			if (items.length === 0 || isRotating.current) return

			// Stop continuous rotation during manual navigation
			if (continuousRotation) {
				stopContinuousRotation()
			}

			isRotating.current = true
			const newIndex = (currentItemIndex + 1) % items.length
			pendingIndexChange.current = newIndex

			if (direction === "top") {
				animate(baseRotateX, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						setCurrentRotation(currentRotation + 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			} else if (direction === "bottom") {
				animate(baseRotateX, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						setCurrentRotation(currentRotation - 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			} else if (direction === "left") {
				animate(baseRotateY, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						setCurrentRotation(currentRotation - 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			} else if (direction === "right") {
				animate(baseRotateY, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						setCurrentRotation(currentRotation + 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			}
		}, [
			items.length,
			direction,
			_transition,
			currentRotation,
			continuousRotation,
			stopContinuousRotation,
			startContinuousRotation,
			handleAnimationComplete,
		])

		const prev = useCallback(() => {
			if (items.length === 0 || isRotating.current) return

			// Stop continuous rotation during manual navigation
			if (continuousRotation) {
				stopContinuousRotation()
			}

			isRotating.current = true
			const newIndex = currentItemIndex === 0 ? items.length - 1 : currentItemIndex - 1
			pendingIndexChange.current = newIndex

			if (direction === "top") {
				animate(baseRotateX, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						setCurrentRotation(currentRotation - 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			} else if (direction === "bottom") {
				animate(baseRotateX, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						setCurrentRotation(currentRotation + 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			} else if (direction === "left") {
				animate(baseRotateY, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						setCurrentRotation(currentRotation + 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			} else if (direction === "right") {
				animate(baseRotateY, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						setCurrentRotation(currentRotation - 90)

						// Restart continuous rotation after manual navigation if enabled
						if (continuousRotation) {
							setTimeout(() => {
								if (!isDragging.current && !isRotating.current) {
									startContinuousRotation()
								}
							}, 100)
						}
					},
				})
			}
		}, [
			items.length,
			direction,
			_transition,
			currentRotation,
			continuousRotation,
			stopContinuousRotation,
			startContinuousRotation,
			handleAnimationComplete,
		])

		useImperativeHandle(
			ref,
			() => ({
				next,
				prev,
				getCurrentItemIndex: () => currentItemIndex,
			}),
			[next, prev, currentItemIndex]
		)

		const depth = useMemo(
			() => (direction === "top" || direction === "bottom" ? height : width),
			[direction, width, height]
		)

		const transform = useTransform(
			isDragging.current ? [springRotateX, springRotateY] : [baseRotateX, baseRotateY],
			([x, y]) => `translateZ(-${depth / 2}px) rotateX(${x}deg) rotateY(${y}deg)`
		)

		// Determine face transforms based on the desired rotation axis
		const faceTransforms = (() => {
			switch (direction) {
				case "left":
					return [
						// left, front, right, back (rotation around Y-axis)
						`rotateY(-90deg) translateZ(${width / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateY(90deg) translateZ(${width / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px)`,
					]
				case "top":
					return [
						// top, front, bottom, back (rotation around X-axis)
						`rotateX(90deg) translateZ(${height / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateX(-90deg) translateZ(${height / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px) rotateZ(180deg)`,
					]
				case "right":
					return [
						// right, front, left, back (rotation around Y-axis)
						`rotateY(90deg) translateZ(${width / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateY(-90deg) translateZ(${width / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px)`,
					]
				case "bottom":
					return [
						// bottom, front, top, back (rotation around X-axis)
						`rotateX(-90deg) translateZ(${height / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateX(90deg) translateZ(${height / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px) rotateZ(180deg)`,
					]
				default:
					return [
						// left, front, right, back (rotation around Y-axis)
						`rotateY(-90deg) translateZ(${width / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateY(90deg) translateZ(${width / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px)`,
					]
			}
		})()

		// Continuous rotation management
		useEffect(() => {
			if (continuousRotation && items.length > 0) {
				startContinuousRotation()
				return stopContinuousRotation
			}
		}, [continuousRotation, items.length, startContinuousRotation, stopContinuousRotation])

		// Pause/resume continuous rotation based on hover state
		useEffect(() => {
			if (!continuousRotation) return

			if (pauseOnHover && isHovered) {
				stopContinuousRotation()
			} else if (!isDragging.current && !isRotating.current) {
				startContinuousRotation()
			}
		}, [
			continuousRotation,
			pauseOnHover,
			isHovered,
			startContinuousRotation,
			stopContinuousRotation,
		])

		// Auto play functionality (disabled when continuous rotation is enabled)
		useEffect(() => {
			if (autoPlay && !continuousRotation && items.length > 0) {
				const interval = setInterval(next, autoPlayInterval)
				return () => clearInterval(interval)
			}
		}, [autoPlay, continuousRotation, items.length, next, autoPlayInterval])

		// Cleanup continuous rotation on unmount
		useEffect(() => {
			return () => {
				if (continuousAnimationRef.current) {
					continuousAnimationRef.current.stop()
				}
			}
		}, [])

		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
				if (isRotating.current) return

				switch (e.key) {
					case "ArrowLeft":
						e.preventDefault()
						if (direction === "left" || direction === "right") {
							prev()
						}
						break
					case "ArrowRight":
						e.preventDefault()
						if (direction === "left" || direction === "right") {
							next()
						}
						break
					case "ArrowUp":
						e.preventDefault()
						if (direction === "top" || direction === "bottom") {
							prev()
						}
						break
					case "ArrowDown":
						e.preventDefault()
						if (direction === "top" || direction === "bottom") {
							next()
						}
						break
					default:
						break
				}
			},
			[direction, next, prev, items.length]
		)

		return (
			<div
				className={cn(
					"relative focus:outline-0",
					enableDrag && "cursor-grab active:cursor-grabbing",
					className
				)}
				style={{
					width,
					height,
					perspective: `${perspective}px`,
				}}
				onKeyDown={handleKeyDown}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				tabIndex={0}
				aria-label={`3D carousel with ${items.length} items`}
				aria-describedby="carousel-instructions"
				aria-live="polite"
				aria-atomic="true"
				onMouseDown={handleDragStart}
				onTouchStart={handleDragStart}
				{...props}
			>
				<div className="sr-only" aria-live="assertive">
					Showing item {currentItemIndex + 1} of {items.length}:{" "}
					{items[currentItemIndex]?.alt || `Item ${currentItemIndex + 1}`}
				</div>

				<motion.div
					className="relative w-full h-full [transform-style:preserve-3d]"
					style={{
						transform: transform,
					}}
				>
					{/* First face */}
					<CubeFace
						transform={faceTransforms[0]}
						style={debug ? { width, height, backgroundColor: "#ff9999" } : { width, height }}
						debug={debug}
					>
						<MediaRenderer item={items[prevIndex]} debug={debug} />
					</CubeFace>

					{/* Second face */}
					<CubeFace
						transform={faceTransforms[1]}
						style={debug ? { width, height, backgroundColor: "#99ff99" } : { width, height }}
						debug={debug}
					>
						<MediaRenderer item={items[currentIndex]} debug={debug} />
					</CubeFace>

					{/* Third face */}
					<CubeFace
						transform={faceTransforms[2]}
						style={debug ? { width, height, backgroundColor: "#9999ff" } : { width, height }}
						debug={debug}
					>
						<MediaRenderer item={items[nextIndex]} debug={debug} />
					</CubeFace>

					{/* Fourth face */}
					<CubeFace
						transform={faceTransforms[3]}
						style={debug ? { width, height, backgroundColor: "#ffff99" } : { width, height }}
						debug={debug}
					>
						<MediaRenderer item={items[afterNextIndex]} debug={debug} />
					</CubeFace>
				</motion.div>
			</div>
		)
	}
)

BoxCarousel.displayName = "BoxCarousel"

export default BoxCarousel
export type { CarouselItem, RotationDirection, SpringConfig }
