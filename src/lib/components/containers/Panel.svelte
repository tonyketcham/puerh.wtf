<section
	class="flex flex-col w-full flex-grow overflow-hidden rounded-2xl border border-white/5 box-border bg-heicha-700/[0.35]"
	style="box-shadow: 0px 8px 14px rgba(0, 0, 0, 0.1);
	backdrop-filter: blur(48px);"
>
	<div>
		<slot name="header" />
	</div>
	<div class="h-full">
		<slot />
	</div>
</section>
