/**
 * Validate and copy a four-channel image frame before PNG encoding.
 * The copy gives the encoder an owned buffer that can be cleared after encoding.
 *
 * @param {{width:number,height:number,rgba:()=>{width:number,height:number,data:Uint8Array|Uint8ClampedArray}}} rawImage
 */
export function normalizeRgbaFrame(rawImage) {
  const width = rawImage?.width;
  const height = rawImage?.height;

  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    typeof rawImage?.rgba !== 'function'
  ) {
    throw new Error('The background-removal model returned an unsupported image.');
  }

  const image = rawImage.rgba();
  const expectedBytes = width * height * 4;

  if (
    !image ||
    image.width !== width ||
    image.height !== height ||
    !ArrayBuffer.isView(image.data) ||
    image.data.BYTES_PER_ELEMENT !== 1 ||
    !Number.isSafeInteger(expectedBytes) ||
    image.data.length !== expectedBytes
  ) {
    throw new Error('The background-removal model returned an incomplete or incorrectly sized image.');
  }

  return {
    width,
    height,
    data: new Uint8ClampedArray(image.data)
  };
}

/**
 * Encode a validated RGBA frame as a transparent PNG.
 * Canvas and ImageData factories are injectable to keep the export testable in Node.
 *
 * @param {Parameters<typeof normalizeRgbaFrame>[0]} rawImage
 * @param {{
 *   createCanvas?: (width:number,height:number) => {width:number,height:number,getContext:(type:string)=>({putImageData:(imageData:{data:Uint8ClampedArray,width:number,height:number},x:number,y:number)=>void}|null),convertToBlob:(options:{type:string})=>Promise<Blob>},
 *   createImageData?: (data:Uint8ClampedArray,width:number,height:number) => {data:Uint8ClampedArray,width:number,height:number}
 * }} [options]
 */
export async function encodeRgbaPng(rawImage, options = {}) {
  const frame = normalizeRgbaFrame(rawImage);
  let canvas = null;
  let pixels = null;

  try {
    canvas = options.createCanvas
      ? options.createCanvas(frame.width, frame.height)
      : new OffscreenCanvas(frame.width, frame.height);

    /** @type {any} */
    const context = canvas?.getContext?.('2d');
    if (!context) {
      throw new Error('This browser cannot create the PNG preview. Try a recent version of Chrome, Edge, or Firefox.');
    }

    pixels = options.createImageData
      ? options.createImageData(frame.data, frame.width, frame.height)
      : new ImageData(frame.data, frame.width, frame.height);

    context.putImageData(pixels, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });

    if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size === 0) {
      throw new Error('This browser could not create a valid transparent PNG. Please try again.');
    }

    return blob;
  } finally {
    // The encoded Blob owns its bytes. Clear both the temporary frame and canvas backing store.
    pixels?.data?.fill(0);
    frame.data.fill(0);

    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
