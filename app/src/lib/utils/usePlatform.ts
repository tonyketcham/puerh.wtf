"use client"

import { useSyncExternalStore } from "react"

const noopSubscribe = () => () => {}

/** "mac" | "other" on the client, null during SSR/hydration (render a neutral placeholder). */
export function usePlatform(): "mac" | "other" | null {
	return useSyncExternalStore(
		noopSubscribe,
		() => {
			const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
			const p = nav.userAgentData?.platform || navigator.platform || navigator.userAgent
			return /mac|iphone|ipad|ipod/i.test(p) ? "mac" : "other"
		},
		() => null
	)
}
