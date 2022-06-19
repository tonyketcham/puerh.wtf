import { visit } from 'unist-util-visit';
import { selectAll } from 'hast-util-select';
import { parseSelector } from 'hast-util-parse-selector';

/**
 * Wraps matched HTML nodes (via selector) with a given tag.
 */
export const wrapMany =
	(options = { tagsToWrap: [], wrapper: 'span' }) =>
	(tree) => {
		// console.log(JSON.stringify(tree, null, 2));
		for (const match of selectAll(generateSelector(options.tagsToWrap), tree)) {
			if (options.tagsToWrap.includes(match.tagName)) {
				visit(tree, match, (node, i, parent) => {
					const wrapper = parseSelector(options.wrapper);
					wrapper.children = node.children;

					node.children = [wrapper];
				});
			}
		}
		// console.log(JSON.stringify(tree));
	};

function generateSelector(elements) {
	return `*:matches(${elements.join(', ')}):not(span)`;
}
