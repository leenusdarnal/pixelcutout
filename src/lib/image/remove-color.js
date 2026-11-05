// @ts-check

/**
 * @typedef {{ r: number; g: number; b: number }} RGBColor
 */

/**
 * Remove pixels close to a sampled background colour in-place.
 * A narrow feather band softens the transition at the selected tolerance.
 *
 * @param {Uint8ClampedArray} pixels RGBA pixel buffer.
 * @param {RGBColor} color Sampled RGB background colour.
 * @param {number} tolerance Euclidean RGB distance threshold, clamped to 1–180.
 * @returns {Uint8ClampedArray} The same pixel buffer with adjusted alpha values.
 */
export function removeColorPixels(pixels, color, tolerance = 48) {
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length % 4 !== 0) {
    throw new TypeError('Expected an RGBA Uint8ClampedArray.');
  }

  if (
    !color ||
    ![color.r, color.g, color.b].every(
      (channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255
    )
  ) {
    throw new TypeError('Expected an RGB colour with channels between 0 and 255.');
  }

  const limit = Number.isFinite(tolerance)
    ? Math.max(1, Math.min(180, tolerance))
    : 48;
  const featherStart = limit * 0.72;
  const featherStartSquared = featherStart * featherStart;
  const limitSquared = limit * limit;
  const featherWidth = Math.max(1, limit - featherStart);

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const originalAlpha = pixels[offset + 3];
    if (originalAlpha === 0) continue;

    const red = pixels[offset] - color.r;
    const green = pixels[offset + 1] - color.g;
    const blue = pixels[offset + 2] - color.b;
    const distanceSquared = red * red + green * green + blue * blue;

    if (distanceSquared <= featherStartSquared) {
      pixels[offset + 3] = 0;
    } else if (distanceSquared < limitSquared) {
      // Only calculate the square root for pixels inside the feather band.
      const distance = Math.sqrt(distanceSquared);
      const coverage = (distance - featherStart) / featherWidth;
      pixels[offset + 3] = Math.round(originalAlpha * coverage);
    }
  }

  return pixels;
}
