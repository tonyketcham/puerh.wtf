import { createStore } from "jotai/vanilla"

/** One store for the client app, shared by React and imperative UI actions. */
export const store = createStore()
