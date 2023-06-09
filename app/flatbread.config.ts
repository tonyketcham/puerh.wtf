import { defineConfig, transformerMarkdown, sourceFilesystem } from 'flatbread';
import { createSvImgField } from '@flatbread/resolver-svimg';
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
	source: sourceFilesystem(),
	transformer: transformerMarkdown(transformerConfig),

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
			},
			overrides: [
				createSvImgField('images[]image', {
					// the field in your content that references your image
					inputDir: 'static', // the base directory of your source images
					outputDir: 'static/images/uploads/g', // where to store your optimized images (these should be committed)
					srcGenerator: (path) => '/images/uploads/g/' + path
				})
			]
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
