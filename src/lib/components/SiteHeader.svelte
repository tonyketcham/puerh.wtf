<script>
	import Github from '$lib/components/icons/Github.svelte';
	import Instagram from '$lib/components/icons/Instagram.svelte';
</script>

<header class="flex flex-row justify-between px-4 py-1 font-display">
	<h1 class="text-6xl leading-[3.25rem] text-bai-cha-100 select-none drop-shadow-split">
		<span>puerh</span>
		<br />
		<span class="block -ml-4">.wtf</span>
	</h1>

	<div class="flex flex-col space-y-1.5 m-auto pt-4 opacity-80">
		<a
			aria-label="source code"
			href="https://github.com/tonyketcham/puerh.wtf"
			class="w-5 h-5 outline-none focus:outline-none hover:text-tea-soup-500 focus:text-tea-soup-500"
		>
			<Github />
		</a>

		<a
			aria-label="puerh.wtf instagram"
			href="https://instagram.com/puerh.wtf/"
			class="w-5 h-5 outline-none focus:outline-none hover:text-tea-soup-500 focus:text-tea-soup-500"
		>
			<Instagram />
		</a>
	</div>
</header>
