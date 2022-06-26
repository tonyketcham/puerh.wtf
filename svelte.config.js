import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';
import os from 'os';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: preprocess({
		postcss: true
	}),

	kit: {
		adapter: adapter({
			precompress: true
		}),
		prerender: {
			concurrency: os.cpus().length,
			default: true
		}
	}
};

export default config;
