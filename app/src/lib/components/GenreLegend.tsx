"use client"

import { useState } from "react"
import type { Category } from "@/lib/types/category"
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react"
import { AnimatePresence, motion } from "motion/react"
import { useFloating } from "@floating-ui/react-dom"

interface GenreLegendProps {
	categories: Category[]
}

export default function GenreLegend({ categories }: GenreLegendProps) {
	const [selectedCategories, setSelectedCategories] = useState<Category[]>([])
	const { x, y, refs, strategy } = useFloating({
		placement: "bottom-start",
	})

	return (
		<div className="sticky top-0 z-30 flex flex-col p-4 border-b bg-background/80 backdrop-blur-xl border-heicha-500/50">
			<Listbox value={selectedCategories} onChange={setSelectedCategories} multiple>
				{({ open }) => (
					<>
						<ListboxButton
							ref={refs.setReference}
							className="flex items-center self-start px-3 py-2 space-x-2 rounded-md group bg-white/5 hover:bg-white/10"
						>
							<span className="font-mono text-sm transition-colors text-white/80 group-hover:text-white">
								Genres
							</span>
						</ListboxButton>
						<AnimatePresence>
							{open && (
								<motion.div
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.95 }}
									transition={{ duration: 0.1 }}
									ref={refs.setFloating}
									style={{
										position: strategy,
										top: y ?? 0,
										left: x ?? 0,
										zIndex: 40,
									}}
									className="mt-2 overflow-hidden rounded-lg shadow-inner bg-black/20 ring-1 ring-black/30 w-max max-h-[60svh]"
								>
									<ListboxOptions
										modal={false}
										className="flex flex-col p-2 space-y-1 overflow-y-auto"
									>
										{categories.map((category) => (
											<ListboxOption
												key={category._slug}
												value={category}
												className="flex items-center px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors group cursor-pointer ui-selected:bg-heicha-500/20"
											>
												{({ selected }) => (
													<>
														<div
															className="w-3 h-3 rounded-full"
															style={{
																backgroundColor: category.color,
															}}
														/>
														<span className="ml-2 font-mono text-sm transition-colors text-white/60 group-hover:text-white/90">
															{category.title}
														</span>
													</>
												)}
											</ListboxOption>
										))}
									</ListboxOptions>
								</motion.div>
							)}
						</AnimatePresence>
					</>
				)}
			</Listbox>
		</div>
	)
}
