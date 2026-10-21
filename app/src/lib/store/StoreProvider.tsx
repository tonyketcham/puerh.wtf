"use client"

import { Provider } from "jotai"
import type { PropsWithChildren } from "react"

import { store } from "./store"
import FilterUrlSync from "./FilterUrlSync"

export const StoreProvider = ({ children }: PropsWithChildren) => {
	return (
		<Provider store={store}>
			<FilterUrlSync />
			{children}
		</Provider>
	)
}
