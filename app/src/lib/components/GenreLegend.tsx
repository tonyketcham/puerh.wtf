"use client"

import { Fragment, useState } from "react"
import type { Category } from "@/lib/types/category"
import {
	Listbox,
	ListboxButton,
	ListboxOption,
	ListboxOptions,
	Transition,
} from "@headlessui/react"
import { LibraryBig, Check } from "lucide-react"

interface GenreLegendProps {
	categories: Category[]
}

export default function GenreLegend({ categories }: GenreLegendProps) {
	const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

	return (
		<Listbox value={selectedCategory} onChange={setSelectedCategory}>
			<>
				<ListboxButton className="flex items-center self-start p-1.5 rounded-md group bg-white/5 hover:bg-white/10">
					<span
						className="transition-colors group-hover:text-white"
						style={{
							color: selectedCategory?.color || "white/80",
						}}
					>
						<LibraryBig />
					</span>
				</ListboxButton>
				<Transition
					as={Fragment}
					leave="transition ease-in duration-100"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<ListboxOptions
						portal
						anchor={{ to: "top", gap: 8 }}
						modal={false}
						className="flex flex-col p-2 space-y-1 overflow-y-auto rounded-2xl w-max max-h-[60svh] border border-heicha-500 bg-heicha-700/90 backdrop-blur-md outline-none"
					>
						{categories.map((category) => (
							<ListboxOption
								key={category._slug}
								value={category}
								className="flex items-center px-3 py-1.5 rounded-md transition-colors group cursor-pointer data-[selected]:bg-heicha-500/20 text-xs hover:bg-white/10 data-[focus]:bg-white/10 data-[active]:bg-white/10"
							>
								{({ selected }) => (
									<>
										<div
											className="w-3 h-3 rounded-full"
											style={{
												backgroundColor: category.color,
											}}
										/>
										<span className="flex-grow ml-2 font-mono text-sm truncate transition-colors text-white/60 group-hover:text-white/90">
											{category.title}
										</span>
										{selected && <Check className="w-4 h-4" />}
									</>
								)}
							</ListboxOption>
						))}
					</ListboxOptions>
				</Transition>
			</>
		</Listbox>
	)
}
