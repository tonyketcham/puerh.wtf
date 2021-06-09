/**
 * Calculates the mean value of an array of values.
 *
 * @param {Array} collection
 * @returns {Number} mean value
 */
export function average(collection) {
  return collection.reduce((accumulation, current) => accumulation + current) / collection.length;
}
