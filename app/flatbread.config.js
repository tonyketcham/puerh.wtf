import { defineConfig, markdownTransforer, filesystem } from 'flatbread';
import { wrapMany } from './plugins/flatbread/wrap.js';

const elementsToWrap = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p'];

const transformerConfig = {
	markdown: {
		gfm: true,
		externalLinks: true,
		rehypePlugins: [
			[
				wrapMany,
				{
					tagsToWrap: elementsToWrap,
					wrapper: 'span.background-box'
				}
			]
		]
	}
};
export default defineConfig({
	source: filesystem(),
	transformer: markdownTransforer(transformerConfig),

	content: [
		{
			path: 'content/tastings',
			collection: 'Session',
			refs: {
				author: 'Author',
				style: 'Style',
				cultivar: 'Varietal',
				origin: 'Origin',
				vendor: 'Vendor',
				tags: 'Tags'
			}
		},
		{
			path: 'content/authors',
			collection: 'Author'
		},
		{
			path: 'content/categories',
			collection: 'Category'
		},
		{
			path: 'content/styles',
			collection: 'Style',
			refs: {
				category: 'Category'
			}
		},
		{
			path: 'content/cultivars',
			collection: 'Varietal',
			refs: {
				style: 'Style'
			}
		},
		{
			path: 'content/origins',
			collection: 'Origin'
		},
		{
			path: 'content/tags',
			collection: 'Tags'
		},
		{
			path: 'content/vendors',
			collection: 'Vendor'
		}
	]
});
