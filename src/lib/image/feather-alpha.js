/**
 * Soften the inside edge of an RGBA cutout without changing RGB values or
 * expanding transparent pixels. Returns the tile indexes touched so callers
 * can store compact, tile-based undo history.
 */
/** @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
 * @param {number} [passes]
 * @param {number} [tileSize]
 */
export function featherAlpha(imageData, passes = 1, tileSize = 128) {
  if (!imageData || !imageData.data || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height)) {
    throw new TypeError('A valid ImageData object is required.');
  }
  if (!Number.isInteger(tileSize) || tileSize < 1) throw new RangeError('tileSize must be a positive integer.');

  const { data, width, height } = imageData;
  const iterations = Math.max(0, Math.min(4, Math.trunc(Number(passes) || 0)));
  if (data.length !== width * height * 4) throw new RangeError('ImageData dimensions do not match its pixel buffer.');
  if (!iterations || width < 3 || height < 3) return { changedPixels: 0, changedTiles: [] };

  let alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];

  const tilesX = Math.ceil(width / tileSize);
  const changedTiles = new Set();
  let changedPixels = 0;

  for (let pass = 0; pass < iterations; pass++) {
    const next = alpha.slice();
    let passChanges = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        const current = alpha[index];
        if (current === 0) continue;

        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const row = (y + dy) * width;
          sum += alpha[row + x - 1] + alpha[row + x] + alpha[row + x + 1];
        }

        // Only lower opacity at the existing edge; never grow the cutout.
        const softened = Math.min(current, Math.round(sum / 9));
        if (softened !== current) {
          next[index] = softened;
          changedTiles.add(Math.floor(y / tileSize) * tilesX + Math.floor(x / tileSize));
          passChanges++;
        }
      }
    }

    alpha = next;
    changedPixels += passChanges;
    if (!passChanges) break;
  }

  if (changedPixels) {
    for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i];
  }

  return { changedPixels, changedTiles: [...changedTiles] };
}
