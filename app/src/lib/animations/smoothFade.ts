import { cubicOut } from 'svelte/easing';

export function smoothFade(
	node: Element,
	params: SvelteAnimationReturnType
): SvelteAnimationReturnType {
	const { delay = 0, duration = 400, easing = cubicOut } = params;

	return {
		delay,
		duration,
		easing,
		css: (t) => `opacity: ${t};`
	};
}
