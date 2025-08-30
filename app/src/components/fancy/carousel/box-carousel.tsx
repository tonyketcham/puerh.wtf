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
					className={cn("object-cover w-full h-full", className)}
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
interface BoxCarouselProps
	extends Omit<
		React.HTMLProps<HTMLDivElement>,
		"onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
	> {
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
	 * Speed multiplier during turns (90-degree transitions)
	 * Higher values make turns faster, creating a dynamic rotation effect
	 * @default 3
	 */
	turnSpeedMultiplier?: number

	/**
	 * Scale factor when hovered (as percentage, e.g., 1.05 = 5% larger)
	 * @default 1.05
	 */
	hoverScale?: number

	/**
	 * Enable scroll wheel control for rotation
	 * When enabled, scroll wheel will control rotation instead of continuous rotation
	 * @default false
	 */
	enableScrollControl?: boolean

	/**
	 * Sensitivity of scroll wheel control (higher = more rotation per scroll)
	 * @default 1
	 */
	scrollSensitivity?: number

	/**
	 * Enable page scroll control for rotation
	 * When enabled, carousel rotation is tied to page scroll position
	 * @default false
	 */
	enablePageScrollControl?: boolean

	/**
	 * Sensitivity of page scroll control (higher = more rotation per scroll pixel)
	 * @default 0.5
	 */
	pageScrollSensitivity?: number

	/**
	 * Offset from top of viewport where scroll control starts (in pixels)
	 * @default 0
	 */
	scrollOffset?: number

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

	/**
	 * Initial rotation offset in degrees
	 * @default 0
	 */
	initialRotationOffset?: number
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
			turnSpeedMultiplier = 3,
			hoverScale = 1.05,
			enableScrollControl = false,
			scrollSensitivity = 1,
			enablePageScrollControl = false,
			pageScrollSensitivity = 0.5,
			scrollOffset = 0,
			pauseOnHover = true,
			pauseOnDrag = true,
			onIndexChange,
			enableDrag = true,
			dragSensitivity = 0.5,
			initialRotationOffset = 0,
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

		const [currentRotation, setCurrentRotation] = useState(initialRotationOffset)
		const [isHovered, setIsHovered] = useState(false)

		const rotationCount = useRef(1)
		const isRotating = useRef(false)
		const pendingIndexChange = useRef<number | null>(null)
		const isDragging = useRef(false)
		const startPosition = useRef({ x: 0, y: 0 })
		const startRotation = useRef(0)
		const continuousAnimationRef = useRef<{ stop: () => void } | null>(null)
		const lastUpdateTime = useRef<number>(0)
		const scrollAccumulator = useRef(0)
		const lastPageScrollY = useRef(0)
		const carouselElementRef = useRef<HTMLElement | null>(null)

		// Single source of truth for rotation
		const rotationMotionValue = useMotionValue(initialRotationOffset)
		const baseRotateX = useMotionValue(0)
		const baseRotateY = useMotionValue(0)

		// Track rotation offset from user interactions (drag, manual navigation)
		const userRotationOffset = useRef(initialRotationOffset)

		// Track previous scroll position to determine scroll direction
		const previousScrollY = useRef(0)

		// Use springs for smoother animation during drag
		const springRotateX = useSpring(baseRotateX, dragSpring)
		const springRotateY = useSpring(baseRotateY, dragSpring)

		// Unified rotation update function - single source of truth
		const updateRotation = useCallback(
			(
				newRotation: number,
				source: "continuous" | "drag" | "scroll" | "pageScroll" | "manual" | "initial" = "manual"
			) => {
				// Update the single source of truth
				rotationMotionValue.set(newRotation)
				setCurrentRotation(newRotation)

				// Track user-initiated rotation changes (not from page scroll)
				if (source !== "pageScroll") {
					userRotationOffset.current = newRotation
				}

				// Apply to appropriate axis based on direction
				const isVertical = direction === "top" || direction === "bottom"
				if (isVertical) {
					baseRotateX.set(newRotation)
				} else {
					baseRotateY.set(newRotation)
				}
			},
			[direction, rotationMotionValue, baseRotateX, baseRotateY]
		)

		// Apply initial rotation offset
		useEffect(() => {
			if (initialRotationOffset !== 0) {
				updateRotation(initialRotationOffset, "initial")
			}
		}, [initialRotationOffset, updateRotation])

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

			// Calculate rotation direction multiplier
			let directionMultiplier = 1
			if (direction === "top" || direction === "left") {
				directionMultiplier = -1
			}

			// Store the starting rotation to track progress
			const startingRotation = rotationMotionValue.get()
			let lastTrackedQuarter = Math.floor((((startingRotation % 360) + 360) % 360) / 90)

			const animateFrame = () => {
				const currentTime = performance.now()
				const deltaTime = (currentTime - lastUpdateTime.current) / 1000 // Convert to seconds
				lastUpdateTime.current = currentTime

				if (shouldPauseContinuous()) {
					return
				}

				const currentValue = rotationMotionValue.get()

				// Calculate dynamic speed based on proximity to quarter boundaries
				const normalizedCurrent = ((currentValue % 360) + 360) % 360
				const positionInQuarter = normalizedCurrent % 90

				// Distance from nearest quarter boundary (0 at boundary, 45 at middle)
				const distanceFromBoundary = Math.min(positionInQuarter, 90 - positionInQuarter)

				// Speed multiplier: faster near boundaries (turns), slower in middle
				// Creates a smooth curve where speed increases as we approach turns
				const speedCurve = 1 + (turnSpeedMultiplier - 1) * (1 - distanceFromBoundary / 45)
				const dynamicSpeed = continuousSpeed * speedCurve

				const rotationIncrement = dynamicSpeed * directionMultiplier * deltaTime
				const newValue = currentValue + rotationIncrement

				// Use unified rotation update
				updateRotation(newValue, "continuous")

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
			rotationMotionValue,
			updateRotation,
			currentItemIndex,
			items.length,
			onIndexChange,
			turnSpeedMultiplier,
		])

		const stopContinuousRotation = useCallback(() => {
			if (continuousAnimationRef.current) {
				continuousAnimationRef.current.stop()
				continuousAnimationRef.current = null
			}
		}, [])

		// Scroll wheel handler
		const handleWheel = useCallback(
			(e: WheelEvent) => {
				if (!enableScrollControl) return

				e.preventDefault()

				// Stop continuous rotation during scroll control
				if (continuousRotation) {
					stopContinuousRotation()
				}

				// Accumulate scroll delta for smoother control
				const scrollDelta = e.deltaY * scrollSensitivity * 0.5
				scrollAccumulator.current += scrollDelta

				// Calculate rotation direction multiplier
				let directionMultiplier = 1
				if (direction === "top" || direction === "left") {
					directionMultiplier = -1
				}

				const currentValue = rotationMotionValue.get()
				const newValue = currentValue + scrollDelta * directionMultiplier

				// Apply the rotation using unified function
				updateRotation(newValue, "scroll")

				// Update item index when crossing 90-degree boundaries
				const normalizedNewValue = ((newValue % 360) + 360) % 360
				const normalizedCurrentValue = ((currentValue % 360) + 360) % 360

				const newQuarter = Math.floor(normalizedNewValue / 90)
				const currentQuarter = Math.floor(normalizedCurrentValue / 90)

				if (newQuarter !== currentQuarter) {
					// Determine rotation direction
					let rotationDirection = 0
					if (Math.abs(newValue - currentValue) < 180) {
						rotationDirection = newValue > currentValue ? 1 : -1
					} else {
						// Handle wrapping around 0/360
						rotationDirection = newValue > currentValue ? -1 : 1
					}

					const indexChange = rotationDirection * directionMultiplier

					let newItemIndex = currentItemIndex
					if (indexChange > 0) {
						newItemIndex = (currentItemIndex + 1) % items.length
					} else {
						newItemIndex = currentItemIndex === 0 ? items.length - 1 : currentItemIndex - 1
					}

					if (newItemIndex !== currentItemIndex) {
						setCurrentItemIndex(newItemIndex)
						onIndexChange?.(newItemIndex)
					}
				}
			},
			[
				enableScrollControl,
				direction,
				scrollSensitivity,
				rotationMotionValue,
				updateRotation,
				currentItemIndex,
				items.length,
				onIndexChange,
				continuousRotation,
				stopContinuousRotation,
			]
		)

		// Page scroll handler
		const handlePageScroll = useCallback(() => {
			if (!enablePageScrollControl || !carouselElementRef.current) return

			const currentScrollY = window.scrollY
			const scrollDelta = currentScrollY - previousScrollY.current
			previousScrollY.current = currentScrollY

			// Only proceed if there's actual scroll movement
			if (Math.abs(scrollDelta) < 1) return

			const element = carouselElementRef.current
			const rect = element.getBoundingClientRect()
			const viewportHeight = window.innerHeight

			// Check if element is in viewport
			const elementTop = rect.top - scrollOffset
			const elementBottom = rect.bottom

			if (elementTop <= viewportHeight && elementBottom >= 0) {
				// Calculate rotation delta based on scroll direction and sensitivity
				// Use much smaller sensitivity (scrollDelta is typically 1-100 pixels)
				const rotationDelta = scrollDelta * pageScrollSensitivity * 0.1

				// Calculate rotation direction multiplier
				let directionMultiplier = 1
				if (direction === "top" || direction === "left") {
					directionMultiplier = -1
				}

				// Apply rotation delta to current user offset
				const newValue = userRotationOffset.current + rotationDelta * directionMultiplier

				// Update the user offset since this is a user-initiated scroll
				userRotationOffset.current = newValue

				// Smoothly update rotation using unified function
				updateRotation(newValue, "pageScroll")

				// Update item index based on rotation
				const normalizedValue = ((newValue % 360) + 360) % 360
				const currentQuarter = Math.floor(normalizedValue / 90)
				const expectedIndex = Math.floor(((normalizedValue / 90) * items.length) / 4) % items.length

				if (expectedIndex !== currentItemIndex) {
					setCurrentItemIndex(expectedIndex)
					onIndexChange?.(expectedIndex)
				}
			}
		}, [
			enablePageScrollControl,
			scrollOffset,
			pageScrollSensitivity,
			direction,
			updateRotation,
			items.length,
			currentItemIndex,
			onIndexChange,
		])

		const handleAnimationComplete = useCallback(
			(triggeredBy: string) => {
				if (isRotating.current && pendingIndexChange.current !== null) {
					isRotating.current = false

					const targetIndex = pendingIndexChange.current

					let newFrontFaceIndex: number
					let currentBackFaceIndex: number

					if (triggeredBy === "next") {
						newFrontFaceIndex = (currentFrontFaceIndex + 1) % 4
						currentBackFaceIndex = (newFrontFaceIndex + 2) % 4
					} else {
						newFrontFaceIndex = (currentFrontFaceIndex - 1 + 4) % 4
						currentBackFaceIndex = (newFrontFaceIndex + 3) % 4
					}

					// Update the current item index first
					setCurrentItemIndex(targetIndex)
					onIndexChange?.(targetIndex)

					// Calculate face indices based on the new current index
					// Ensure all face indices are properly synchronized
					const indexOffset = triggeredBy === "next" ? 2 : -1

					if (currentBackFaceIndex === 0) {
						setPrevIndex((targetIndex + indexOffset + items.length) % items.length)
					} else if (currentBackFaceIndex === 1) {
						setCurrentIndex((targetIndex + indexOffset + items.length) % items.length)
					} else if (currentBackFaceIndex === 2) {
						setNextIndex((targetIndex + indexOffset + items.length) % items.length)
					} else if (currentBackFaceIndex === 3) {
						setAfterNextIndex((targetIndex + indexOffset + items.length) % items.length)
					}

					// Clear pending change before updating front face index
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
				if (!enableDrag || isRotating.current || pendingIndexChange.current !== null) return

				isDragging.current = true
				const point = "touches" in e ? e.touches[0] : e
				startPosition.current = { x: point.clientX, y: point.clientY }

				// Get the actual current rotation value for accurate drag start
				startRotation.current = rotationMotionValue.get()

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
				rotationMotionValue,
				continuousRotation,
				pauseOnDrag,
				stopContinuousRotation,
			]
		)

		const handleDragMove = useCallback(
			(e: MouseEvent | TouchEvent) => {
				if (!isDragging.current || isRotating.current || pendingIndexChange.current !== null) return

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

				// Apply the rotation immediately during drag using unified function
				updateRotation(newRotation, "drag")
			},
			[enableDrag, direction, dragSensitivity, updateRotation]
		)

		const handleDragEnd = useCallback(() => {
			if (!isDragging.current) return

			isDragging.current = false

			const currentValue = rotationMotionValue.get()

			// Calculate the nearest quarter rotation (90-degree increment)
			const quarterRotations = Math.round(currentValue / 90)
			const snappedRotation = quarterRotations * 90

			// Calculate how many steps we've moved from the drag start position
			const rotationDifference = snappedRotation - startRotation.current
			const steps = Math.round(rotationDifference / 90)

			if (steps !== 0) {
				// Prevent conflicting operations
				if (pendingIndexChange.current !== null) {
					// If there's already a pending change, just snap to position
					animate(rotationMotionValue, snappedRotation, {
						...snapTransition,
						onComplete: () => {
							updateRotation(snappedRotation, "manual")
							if (continuousRotation) {
								setTimeout(() => {
									if (!isDragging.current && !isRotating.current) {
										startContinuousRotation()
									}
								}, 100)
							}
						},
					})
					return
				}

				isRotating.current = true

				// Calculate new item index based on steps and direction
				// Account for direction-specific rotation mapping
				let indexSteps = steps

				// For "top" and "left" directions, positive rotation goes backward
				if (direction === "top" || direction === "left") {
					indexSteps = -steps
				}

				// Use modular arithmetic for more robust index calculation
				const totalSteps = Math.abs(indexSteps)
				let newItemIndex = currentItemIndex

				if (indexSteps > 0) {
					newItemIndex = (currentItemIndex + totalSteps) % items.length
				} else {
					newItemIndex = (currentItemIndex - totalSteps + items.length) % items.length
				}

				// Ensure the new index is valid
				newItemIndex = Math.max(0, Math.min(items.length - 1, newItemIndex))

				pendingIndexChange.current = newItemIndex

				// Animate to the snapped position using unified rotation
				animate(rotationMotionValue, snappedRotation, {
					...snapTransition,
					onComplete: () => {
						handleAnimationComplete(steps > 0 ? "next" : "prev")
						updateRotation(snappedRotation, "manual")

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
				animate(rotationMotionValue, snappedRotation, {
					...snapTransition,
					onComplete: () => {
						updateRotation(snappedRotation, "manual")

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
			rotationMotionValue,
			updateRotation,
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

		// Set up scroll wheel event listener
		useEffect(() => {
			const containerElement = document.getElementById(`carousel-${items[0]?.id || "default"}`)
			if (enableScrollControl && containerElement) {
				containerElement.addEventListener("wheel", handleWheel, { passive: false })

				return () => {
					containerElement.removeEventListener("wheel", handleWheel)
				}
			}
		}, [enableScrollControl, handleWheel, items])

		// Set up page scroll event listener
		useEffect(() => {
			if (enablePageScrollControl) {
				// Store reference to carousel element
				const containerElement = document.getElementById(`carousel-${items[0]?.id || "default"}`)
				carouselElementRef.current = containerElement

				window.addEventListener("scroll", handlePageScroll, { passive: true })

				// Delay initial trigger to allow initial rotation offset to be applied
				const timer = setTimeout(() => {
					if (initialRotationOffset === 0) {
						// Only trigger on initial load if no rotation offset is set
						handlePageScroll()
					}
				}, 150)

				return () => {
					clearTimeout(timer)
					window.removeEventListener("scroll", handlePageScroll)
				}
			}
		}, [enablePageScrollControl, handlePageScroll, items, initialRotationOffset])

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
				animate(rotationMotionValue, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						updateRotation(currentRotation + 90, "manual")

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
				animate(rotationMotionValue, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						updateRotation(currentRotation - 90, "manual")

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
				animate(rotationMotionValue, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						updateRotation(currentRotation - 90, "manual")

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
				animate(rotationMotionValue, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("next")
						updateRotation(currentRotation + 90, "manual")

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
				animate(rotationMotionValue, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						updateRotation(currentRotation - 90, "manual")

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
				animate(rotationMotionValue, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						updateRotation(currentRotation + 90, "manual")

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
				animate(rotationMotionValue, currentRotation + 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						updateRotation(currentRotation + 90, "manual")

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
				animate(rotationMotionValue, currentRotation - 90, {
					..._transition,
					onComplete: () => {
						handleAnimationComplete("prev")
						updateRotation(currentRotation - 90, "manual")

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

		// Create a motion value for scale
		const scaleMotionValue = useMotionValue(1)
		const scale = useSpring(scaleMotionValue, { stiffness: 300, damping: 30 })

		// Update scale based on hover state
		useEffect(() => {
			scaleMotionValue.set(isHovered ? hoverScale : 1)
		}, [isHovered, hoverScale, scaleMotionValue])

		const transform = useTransform(rotationMotionValue, (rotation) => {
			const isVertical = direction === "top" || direction === "bottom"
			const x = isVertical ? rotation : 0
			const y = isVertical ? 0 : rotation
			return `translateZ(-${depth / 2}px) rotateX(${x}deg) rotateY(${y}deg)`
		})

		const containerTransform = useTransform(scale, (s) => `scale(${s})`)

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

		// Continuous rotation management (disabled when any scroll control is enabled)
		useEffect(() => {
			if (
				continuousRotation &&
				!enableScrollControl &&
				!enablePageScrollControl &&
				items.length > 0
			) {
				// Add a small delay to ensure initial rotation offset is applied first
				const timer = setTimeout(() => {
					startContinuousRotation()
				}, 100)

				return () => {
					clearTimeout(timer)
					stopContinuousRotation()
				}
			}
		}, [
			continuousRotation,
			enableScrollControl,
			enablePageScrollControl,
			items.length,
			startContinuousRotation,
			stopContinuousRotation,
		])

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

		// Auto play functionality (disabled when continuous rotation or any scroll control is enabled)
		useEffect(() => {
			if (
				autoPlay &&
				!continuousRotation &&
				!enableScrollControl &&
				!enablePageScrollControl &&
				items.length > 0
			) {
				const interval = setInterval(next, autoPlayInterval)
				return () => clearInterval(interval)
			}
		}, [
			autoPlay,
			continuousRotation,
			enableScrollControl,
			enablePageScrollControl,
			items.length,
			next,
			autoPlayInterval,
		])

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
			<motion.div
				id={`carousel-${items[0]?.id || "default"}`}
				className={cn(
					"relative focus:outline-0",
					enableDrag && "cursor-grab active:cursor-grabbing",
					className
				)}
				style={{
					width,
					height,
					perspective: `${perspective}px`,
					transform: containerTransform,
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
			</motion.div>
		)
	}
)

BoxCarousel.displayName = "BoxCarousel"

export default BoxCarousel
export type { CarouselItem, RotationDirection, SpringConfig }
