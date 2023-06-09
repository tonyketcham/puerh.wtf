/**
 * Converts an input number into a hue-compliant circular degree output
 * @param input {number} numerical seed
 * @param offset {number} skew the hue by a factor
 **/
export function convertToHue(input, offset = 7) {
  return (input * offset) % 360;
}

/**
 * Converts an input number into an HSL CSS value
 * @param input {number} numerical seed
 * @param offset {number} skew the hue by a factor
 **/
export function convertToHSL(input, offset = 7) {
  const hue = convertToHue(input, offset);
  return `hsl(${hue},92%,62%)`;
}
