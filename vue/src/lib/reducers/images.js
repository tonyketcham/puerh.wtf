import { SITE_URL } from '@/lib/constants/brand';

const absolutePath = new RegExp('^(?:[a-z]+:)?//', 'i');

export function isAbsolutePath(path) {
  return absolutePath.test(path);
}

/**
 * Reduces and unifies image paths to be absolute paths.
 * @param {String} path image URL (relative or absolute)
 * @returns absolute URL path
 */
export function imagePathReducer(path) {
  if (typeof path !== 'string' || path.length === 0) return null;

  if (isAbsolutePath(path)) return path;

  return SITE_URL + path;
}
