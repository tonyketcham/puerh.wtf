<article class="relative inset-0 h-screen px-56 py-6 parallax">
	<div class="absolute inset-0 w-full px-56 top-96 parallax__layer--back">
		<img src="/images/uploads/1988-wuyi_4.jpeg" alt="Test" width="500" />
	</div>
	<section class="relative top-0 block w-full h-screen mx-28 parallax__layer--base">
		<h2 class="font-display text-[121px] leading-[113.7%]">
			2015 <br />Walong
		</h2>
	</section>
</article>

<style>
	.parallax {
		perspective: 1px;
		@apply overflow-x-hidden overflow-y-auto;
	}
	.parallax__layer--base {
		transform: translateZ(0);
	}
	.parallax__layer--back {
		transform: translateZ(-1px) scale(2);
	}
</style>
