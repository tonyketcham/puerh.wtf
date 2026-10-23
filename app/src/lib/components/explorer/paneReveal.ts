import { createContext, useContext } from "react"

/**
 * How many times the enclosing Explorer pane has been revealed. The panes stay mounted (in
 * <Activity>), so entrance animations that used to replay because a switch remounted the
 * view, such as the row marks drawing on, key themselves on this to replay on every reveal.
 */
export const PaneRevealContext = createContext(0)

export const usePaneReveal = () => useContext(PaneRevealContext)
