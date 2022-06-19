import defineConfig from '@flatbread/config';
import transformer from '@flatbread/transformer-markdown';
// import transformer from '@flatbread/transformer-yaml';
import filesystem from '@flatbread/source-filesystem';
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
	transformer: transformer(transformerConfig),

	content: [
		{
			path: 'content/tastings',
			typeName: 'Tasting',
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
			typeName: 'Author'
		},
		{
			path: 'content/categories',
			typeName: 'Category'
		},
		{
			path: 'content/styles',
			typeName: 'Style',
			refs: {
				category: 'Category'
			}
		},
		{
			path: 'content/cultivars',
			typeName: 'Varietal',
			refs: {
				style: 'Style'
			}
		},
		{
			path: 'content/origins',
			typeName: 'Origin'
		},
		{
			path: 'content/tags',
			typeName: 'Tags'
		},
		{
			path: 'content/vendors',
			typeName: 'Vendor'
		}
	]
});
