"use client"

import { Provider } from "jotai"
import type { PropsWithChildren } from "react"

import { createStore } from "jotai"
import { DevTools } from "jotai-devtools"
import "jotai-devtools/styles.css"

const store = createStore()

export const StoreProvider = ({ children }: PropsWithChildren) => {
	return (
		<Provider store={store}>
			{DevTools({ store }) as React.ReactNode}
			{children}
		</Provider>
	)
}
