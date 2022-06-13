<section
	class="flex flex-col w-full h-full overflow-hidden divide-y rounded-2xl divide-tea-soup-500/30 ring-1 ring-tea-soup-500/30"
>
	<div class="bg-heicha-700/70 backdrop-blur-xl">
		<slot name="header"><h2>Heading</h2></slot>
	</div>
	<div class="h-full bg-heicha-800/70 backdrop-blur-xl">
		<slot />
	</div>
</section>
