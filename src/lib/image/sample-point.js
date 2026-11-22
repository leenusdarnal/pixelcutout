/**
 * Map a pointer position on the displayed source image to a source pixel.
 * Keyboard activation deliberately samples the image centre because it has
 * no pointer coordinates.
 *
 * @param {{
 *   imageWidth:number,
 *   imageHeight:number,
 *   bounds:{left:number,top:number,width:number,height:number},
 *   clientX:number,
 *   clientY:number,
 *   keyboardActivation?:boolean
 * }} options
 * @returns {{x:number,y:number}}
 */
export function getBackgroundSamplePoint({
  imageWidth,
  imageHeight,
  bounds,
  clientX,
  clientY,
  keyboardActivation = false
}) {
  if (
    !Number.isSafeInteger(imageWidth) ||
    !Number.isSafeInteger(imageHeight) ||
    imageWidth < 1 ||
    imageHeight < 1 ||
    !bounds ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new Error('The image is not ready for colour sampling.');
  }

  if (keyboardActivation) {
    return {
      x: Math.floor(imageWidth / 2),
      y: Math.floor(imageHeight / 2)
    };
  }

  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    throw new Error('A pointer position is required to sample this pixel.');
  }

  return {
    x: Math.max(0, Math.min(imageWidth - 1, Math.floor((clientX - bounds.left) * imageWidth / bounds.width))),
    y: Math.max(0, Math.min(imageHeight - 1, Math.floor((clientY - bounds.top) * imageHeight / bounds.height)))
  };
}
