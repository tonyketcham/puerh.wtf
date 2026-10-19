"use client"

import { Provider } from "jotai"
import type { PropsWithChildren } from "react"

import { createStore } from "jotai"

const store = createStore()

export const StoreProvider = ({ children }: PropsWithChildren) => {
	return <Provider store={store}>{children}</Provider>
}
