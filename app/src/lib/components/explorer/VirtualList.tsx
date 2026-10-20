"use client"

import {
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
} from "react"
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual"

export type VirtualListNavigation = {
	focusKey: (key: string) => boolean
	focusNext: (element: HTMLElement) => boolean
}
const NavigationContext = createContext<VirtualListNavigation | null>(null)
export const useVirtualListNavigation = () => useContext(NavigationContext)
const focusable = 'a[href], button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]'

interface Props<T> {
	items: readonly T[]
	getKey: (item: T) => string
	getFocusKey?: (item: T) => string
	rowHeight: number | ((item: T) => number)
	renderRow: (item: T, index: number) => ReactNode
	label?: string
	className?: string
	rowClassName?: (item: T) => string | undefined
	rowData?: (item: T, index: number) => Record<string, string | undefined>
	onKeyDown?: (event: KeyboardEvent<HTMLUListElement>, navigation: VirtualListNavigation) => void
}

/** One scroll owner, one viewport observer, and a bounded window of real rows. */
export default function VirtualList<T>({
	items,
	getKey,
	getFocusKey = getKey,
	rowHeight,
	renderRow,
	label,
	className,
	rowClassName,
	rowData,
	onKeyDown,
}: Props<T>) {
	"use no memo"
	const root = useRef<HTMLUListElement>(null)
	const frame = useRef<number | null>(null)
	const [margin, setMargin] = useState(0)
	const [stickyHeight, setStickyHeight] = useState(0)
	const [focusedKey, setFocusedKey] = useState<string | null>(null)
	const [draggedKey, setDraggedKey] = useState<string | null>(null)
	const keyIndices = useMemo(
		() => new Map(items.map((item, index) => [getKey(item), index])),
		[items, getKey]
	)
	const focusedIndex = focusedKey === null ? undefined : keyIndices.get(focusedKey)
	const draggedIndex = draggedKey === null ? undefined : keyIndices.get(draggedKey)
	const getScrollElement = useCallback(
		() => root.current?.closest<HTMLElement>(".simplebar-content-wrapper") ?? null,
		[]
	)
	const getItemKey = useCallback((index: number) => getKey(items[index]), [items, getKey])
	const estimateSize = useCallback(
		(index: number) => (typeof rowHeight === "number" ? rowHeight : rowHeight(items[index])),
		[items, rowHeight]
	)
	const rangeExtractor = useCallback(
		(range: Range) => {
			const indices = defaultRangeExtractor(range)
			// Keep the actual keyboard focus mounted when the user scrolls it offscreen.
			if (focusedIndex !== undefined && !indices.includes(focusedIndex)) indices.push(focusedIndex)
			if (draggedIndex !== undefined && !indices.includes(draggedIndex)) indices.push(draggedIndex)
			return indices.sort((a, b) => a - b)
		},
		[focusedIndex, draggedIndex]
	)
	// TanStack's live instance is read directly; this adapter opts out of compiler memoization.
	// eslint-disable-next-line react-hooks/incompatible-library
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement,
		getItemKey,
		estimateSize,
		overscan: 3,
		scrollMargin: margin,
		scrollPaddingStart: stickyHeight,
		rangeExtractor,
	})

	useLayoutEffect(() => {
		const scroll = getScrollElement()
		const list = root.current
		if (!scroll || !list) return
		const measure = () => {
			setMargin(
				list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
			)
			setStickyHeight(scroll.querySelector<HTMLElement>(".sticky")?.offsetHeight ?? 0)
		}
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(scroll)
		if (list.parentElement) observer.observe(list.parentElement)
		const content = scroll.querySelector(".simplebar-content")
		if (content) observer.observe(content)
		return () => observer.disconnect()
	}, [getScrollElement])

	useLayoutEffect(
		() => () => {
			if (frame.current !== null) cancelAnimationFrame(frame.current)
		},
		[]
	)

	const focusIndex = useCallback(
		(index: number, last = false) => {
			if (!items.length) return false
			index = Math.max(0, Math.min(items.length - 1, index))
			setFocusedKey(getKey(items[index]))
			const key = getKey(items[index])
			virtualizer.scrollToIndex(index, { align: "auto" })
			if (frame.current !== null) cancelAnimationFrame(frame.current)
			frame.current = requestAnimationFrame(() => {
				frame.current = null
				const row = root.current?.querySelector<HTMLElement>(
					`[data-virtual-key="${CSS.escape(key)}"]`
				)
				const targets = row?.querySelectorAll<HTMLElement>(focusable)
				const target = last ? targets?.[targets.length - 1] : targets?.[0]
				target?.focus({ preventScroll: true })
			})
			return true
		},
		[items, getKey, virtualizer]
	)
	const navigation = useMemo<VirtualListNavigation>(
		() => ({
			focusKey: (key) => {
				const index = items.findIndex((item) => getFocusKey(item) === key)
				return index >= 0 && focusIndex(index)
			},
			focusNext: (element) => {
				const index = Number(
					element.closest<HTMLElement>("[data-virtual-index]")?.dataset.virtualIndex
				)
				return Number.isFinite(index) && index + 1 < items.length && focusIndex(index + 1)
			},
		}),
		[items, getFocusKey, focusIndex]
	)
	const onKeyDownCapture = (event: KeyboardEvent<HTMLUListElement>) => {
		if (event.altKey || event.ctrlKey || event.metaKey || (event.shiftKey && event.key !== "Tab"))
			return
		const element = event.target as HTMLElement
		const row = element.closest<HTMLElement>("[data-virtual-index]")
		if (!row) return
		const index = Number(row.dataset.virtualIndex)
		let next: number
		let last = false
		switch (event.key) {
			case "ArrowDown":
				next = index + 1
				break
			case "ArrowUp":
				next = index - 1
				break
			case "Home":
				next = 0
				break
			case "End":
				next = items.length - 1
				break
			case "PageDown":
				next =
					index +
					Math.max(1, Math.floor((getScrollElement()?.clientHeight ?? 300) / estimateSize(index)))
				break
			case "PageUp":
				next =
					index -
					Math.max(1, Math.floor((getScrollElement()?.clientHeight ?? 300) / estimateSize(index)))
				break
			case "Tab": {
				const targets = [...row.querySelectorAll<HTMLElement>(focusable)]
				if (
					event.shiftKey
						? element !== targets[0] || index === 0
						: element !== targets.at(-1) || index === items.length - 1
				)
					return
				last = event.shiftKey
				next = index + (last ? -1 : 1)
				break
			}
			default:
				return
		}
		event.preventDefault()
		event.stopPropagation()
		focusIndex(next, last)
	}
	const style: CSSProperties = {
		position: "relative",
		height: virtualizer.getTotalSize(),
		overflowAnchor: "none",
	}
	return (
		<NavigationContext.Provider value={navigation}>
			<ul
				ref={root}
				className={className}
				aria-label={label}
				data-virtual-list
				data-virtual-total={items.length}
				style={style}
				onKeyDownCapture={onKeyDownCapture}
				onKeyDown={(event) => onKeyDown?.(event, navigation)}
				onFocusCapture={(event) => {
					const key = (event.target as HTMLElement).closest<HTMLElement>("[data-virtual-key]")
						?.dataset.virtualKey
					if (key) setFocusedKey(key)
				}}
				onBlurCapture={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedKey(null)
				}}
				onDragStartCapture={(event) =>
					setDraggedKey(
						(event.target as HTMLElement).closest<HTMLElement>("[data-virtual-key]")?.dataset
							.virtualKey ?? null
					)
				}
				onDragEndCapture={() => setDraggedKey(null)}
			>
				{virtualizer.getVirtualItems().map((item) => (
					<li
						key={item.key}
						data-virtual-index={item.index}
						data-virtual-key={String(item.key)}
						aria-posinset={item.index + 1}
						aria-setsize={items.length}
						className={rowClassName?.(items[item.index])}
						{...rowData?.(items[item.index], item.index)}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							height: item.size,
							transform: `translateY(${item.start - margin}px)`,
						}}
					>
						{renderRow(items[item.index], item.index)}
					</li>
				))}
			</ul>
		</NavigationContext.Provider>
	)
}
