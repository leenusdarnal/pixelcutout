<script lang="ts">
 import { onMount } from 'svelte';
 import { featherAlpha } from '$lib/image/feather-alpha.js';

 type Tool = 'erase' | 'restore';
 type Background = 'transparent' | 'white' | 'soft' | 'dark' | 'gradient' | 'image' | 'custom';
 type TilePatch = { x: number; y: number; w: number; h: number; before: ImageData; after?: ImageData };
 type HistoryEntry = { patches: TilePatch[] };

 let { src, onError = () => {} } = $props<{
  src: string;
  onError?: (message: string) => void;
 }>();

 let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
 let ready = $state(false);
 let tool = $state<Tool>('erase');
 let brushSize = $state(44);
 let edgeSoftness = $state(1);
 let edgeBusy = $state(false);
 let background = $state<Background>('transparent');
 let backgroundColor = $state('#e8eee4');
 let backgroundImageUrl = $state('');
 let shadow = $state(0);
 let format = $state<'png' | 'jpeg' | 'webp'>('png');
 let history = $state<HistoryEntry[]>([]);
 let future = $state<HistoryEntry[]>([]);
 let cropMessage = $state('');
 const TILE_SIZE = 128;
 let baseCanvas: HTMLCanvasElement | null = null;
 let drawing = false;
 let lastPoint: { x: number; y: number } | null = null;
 let activePatches = new Map<string, TilePatch>();
 let loadVersion = 0;
 let bgInput: HTMLInputElement | undefined;

 let backgroundStyle = $derived.by(() => {
  if (background === 'white') return 'background:#ffffff';
  if (background === 'soft') return 'background:#f2eee7';
  if (background === 'custom') return `background:${backgroundColor}`;
  if (background === 'dark') return 'background:#23252b';
  if (background === 'gradient') return 'background:linear-gradient(135deg,#f2d6bf 0%,#dce7f2 52%,#d8e8d2 100%)';
  if (background === 'image' && backgroundImageUrl) {
   return `background-image:url("${backgroundImageUrl}");background-size:cover;background-position:center`;
  }
  return '';
 });

 function canvasContext() {
  return canvasEl?.getContext('2d', { willReadFrequently: true }) ?? null;
 }

 async function loadImage(source: string) {
  const version = ++loadVersion;
  ready = false;
  const image = new Image();
  image.decoding = 'async';
  image.src = source;

  try {
   await image.decode();
  } catch {
   if (version === loadVersion) onError('The cutout preview could not be loaded. Please run background removal again.');
   return;
  }

  if (version !== loadVersion || !canvasEl) return;
  canvasEl.width = image.naturalWidth;
  canvasEl.height = image.naturalHeight;
  const context = canvasContext();
  if (!context) {
   onError('This browser could not open the editing canvas.');
   return;
  }
  context.clearRect(0, 0, canvasEl.width, canvasEl.height);
  context.drawImage(image, 0, 0);
  baseCanvas = document.createElement('canvas');
  baseCanvas.width = image.naturalWidth;
  baseCanvas.height = image.naturalHeight;
  baseCanvas.getContext('2d')?.drawImage(image, 0, 0);
  history = [];
  future = [];
  cropMessage = '';
  ready = true;
 }

 $effect(() => {
  const current = src;
  if (current) void loadImage(current);
 });

 function pointFromEvent(event: PointerEvent) {
  if (!canvasEl) return null;
  const rect = canvasEl.getBoundingClientRect();
  return {
   x: Math.max(0, Math.min(canvasEl.width, (event.clientX - rect.left) * canvasEl.width / rect.width)),
   y: Math.max(0, Math.min(canvasEl.height, (event.clientY - rect.top) * canvasEl.height / rect.height))
  };
 }

 function snapshotTiles(minX: number, minY: number, maxX: number, maxY: number) {
  const context = canvasContext();
  if (!canvasEl || !context) return;
  const radius = Math.max(1, brushSize / 2);
  const left = Math.max(0, Math.floor((minX - radius) / TILE_SIZE) * TILE_SIZE);
  const top = Math.max(0, Math.floor((minY - radius) / TILE_SIZE) * TILE_SIZE);
  const right = Math.min(canvasEl.width, Math.ceil((maxX + radius) / TILE_SIZE) * TILE_SIZE);
  const bottom = Math.min(canvasEl.height, Math.ceil((maxY + radius) / TILE_SIZE) * TILE_SIZE);

  for (let y = top; y < bottom; y += TILE_SIZE) {
   for (let x = left; x < right; x += TILE_SIZE) {
    const key = `${x}:${y}`;
    if (activePatches.has(key)) continue;
    const w = Math.min(TILE_SIZE, canvasEl.width - x);
    const h = Math.min(TILE_SIZE, canvasEl.height - y);
    activePatches.set(key, { x, y, w, h, before: context.getImageData(x, y, w, h) });
   }
  }
 }

 function eraseAt(from: { x: number; y: number }, to: { x: number; y: number }) {
  const context = canvasContext();
  if (!context) return;
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  context.strokeStyle = '#000000';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  if (from.x === to.x && from.y === to.y) {
   context.beginPath();
   context.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
   context.fill();
  }
  context.restore();
 }

 function restoreAt(from: { x: number; y: number }, to: { x: number; y: number }) {
  const context = canvasContext();
  if (!context || !baseCanvas) return;
  const radius = brushSize / 2;
  context.save();
  context.beginPath();

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.01) {
   context.arc(to.x, to.y, radius, 0, Math.PI * 2);
  } else {
   // Build a capsule-shaped clip path so fast pointer movement restores a continuous stroke.
   const angle = Math.atan2(dy, dx);
   const side = angle + Math.PI / 2;
   context.moveTo(from.x + Math.cos(side) * radius, from.y + Math.sin(side) * radius);
   context.lineTo(to.x + Math.cos(side) * radius, to.y + Math.sin(side) * radius);
   context.arc(to.x, to.y, radius, side, side + Math.PI);
   context.lineTo(from.x - Math.cos(side) * radius, from.y - Math.sin(side) * radius);
   context.arc(from.x, from.y, radius, side + Math.PI, side + Math.PI * 2);
  }

  context.closePath();
  context.clip();
  context.globalCompositeOperation = 'source-over';
  context.drawImage(baseCanvas, 0, 0);
  context.restore();
 }

 function applyBrush(from: { x: number; y: number }, to: { x: number; y: number }) {
  if (tool === 'erase') eraseAt(from, to);
  else restoreAt(from, to);
 }

 function startStroke(event: PointerEvent) {
  if (!ready || !canvasEl || event.button !== 0) return;
  const point = pointFromEvent(event);
  if (!point) return;
  event.preventDefault();
  canvasEl.setPointerCapture(event.pointerId);
  drawing = true;
  lastPoint = point;
  activePatches = new Map();
  snapshotTiles(point.x, point.y, point.x, point.y);
  applyBrush(point, point);
 }

 function moveStroke(event: PointerEvent) {
  if (!drawing || !lastPoint) return;
  const point = pointFromEvent(event);
  if (!point) return;
  snapshotTiles(
   Math.min(lastPoint.x, point.x),
   Math.min(lastPoint.y, point.y),
   Math.max(lastPoint.x, point.x),
   Math.max(lastPoint.y, point.y)
  );
  applyBrush(lastPoint, point);
  lastPoint = point;
 }

 function finishStroke() {
  if (!drawing) return;
  drawing = false;
  lastPoint = null;
  const context = canvasContext();
  if (context) {
   for (const patch of activePatches.values()) {
    patch.after = context.getImageData(patch.x, patch.y, patch.w, patch.h);
   }
  }
  if (activePatches.size) {
   history = [...history, { patches: [...activePatches.values()] }].slice(-24);
   future = [];
  }
  activePatches.clear();
 }

 function applyHistory(entry: HistoryEntry, direction: 'before' | 'after') {
  const context = canvasContext();
  if (!context) return;
  for (const patch of entry.patches) {
   const image = direction === 'before' ? patch.before : patch.after;
   if (image) context.putImageData(image, patch.x, patch.y);
  }
 }

 function undo() {
  const entry = history[history.length - 1];
  if (!entry) return;
  applyHistory(entry, 'before');
  history = history.slice(0, -1);
  future = [...future, entry];
 }

 function redo() {
  const entry = future[future.length - 1];
  if (!entry) return;
  applyHistory(entry, 'after');
  future = future.slice(0, -1);
  history = [...history, entry];
 }

 async function applyEdgeFeather() {
  const context = canvasContext();
  if (!canvasEl || !context || !ready || edgeBusy) return;
  edgeBusy = true;
  try {
   // Yield once so the UI can show progress before reading a potentially large canvas.
   await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
   const image = context.getImageData(0, 0, canvasEl.width, canvasEl.height);
   const result = featherAlpha(image, edgeSoftness, TILE_SIZE);
   if (!result.changedPixels) {
    cropMessage = 'No hard transparent edge pixels needed softening.';
    return;
   }

   const tilesX = Math.ceil(canvasEl.width / TILE_SIZE);
   const patches = new Map<string, TilePatch>();
   for (const tileIndex of result.changedTiles) {
    const x = (tileIndex % tilesX) * TILE_SIZE;
    const y = Math.floor(tileIndex / tilesX) * TILE_SIZE;
    const w = Math.min(TILE_SIZE, canvasEl.width - x);
    const h = Math.min(TILE_SIZE, canvasEl.height - y);
    patches.set(`${x}:${y}`, { x, y, w, h, before: context.getImageData(x, y, w, h) });
   }

   context.putImageData(image, 0, 0);
   for (const patch of patches.values()) patch.after = context.getImageData(patch.x, patch.y, patch.w, patch.h);
   history = [...history, { patches: [...patches.values()] }].slice(-24);
   future = [];
   cropMessage = `Softened ${result.changedPixels.toLocaleString()} edge pixels. Use Undo to reverse.`;
  } catch (error) {
   onError(error instanceof Error ? error.message : 'Could not soften the cutout edges.');
  } finally {
   edgeBusy = false;
  }
 }

 function resetEdits() {
  if (!src) return;
  if (backgroundImageUrl) {
   URL.revokeObjectURL(backgroundImageUrl);
   backgroundImageUrl = '';
  }
  background = 'transparent';
  shadow = 0;
  tool = 'erase';
  brushSize = 44;
  edgeSoftness = 1;
  void loadImage(src);
 }

 function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if (!(event.ctrlKey || event.metaKey)) return;

  const key = event.key.toLowerCase();
  if (key === 'z') {
   event.preventDefault();
   if (event.shiftKey) redo();
   else undo();
  } else if (key === 'y') {
   event.preventDefault();
   redo();
  }
 }

 function croppedCopy(source: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  const next = document.createElement('canvas');
  next.width = width;
  next.height = height;
  next.getContext('2d')?.drawImage(source, x, y, width, height, 0, 0, width, height);
  return next;
 }

 function applyCrop(x: number, y: number, width: number, height: number, label: string) {
  if (!canvasEl || !baseCanvas) return;
  const current = croppedCopy(canvasEl, x, y, width, height);
  const original = croppedCopy(baseCanvas, x, y, width, height);
  canvasEl.width = width;
  canvasEl.height = height;
  canvasContext()?.drawImage(current, 0, 0);
  baseCanvas = original;
  history = [];
  future = [];
  cropMessage = label;
 }

 function cropTo(ratioName: string) {
  if (!canvasEl) return;
  const width = canvasEl.width;
  const height = canvasEl.height;
  if (ratioName === 'original') {
   cropMessage = 'Original framing';
   return;
  }
  const ratios: Record<string, number> = { square: 1, portrait: 4 / 5, story: 9 / 16, landscape: 16 / 9 };
  const target = ratios[ratioName];
  if (!target) return;
  const current = width / height;
  let cropWidth = width;
  let cropHeight = height;
  if (current > target) cropWidth = Math.round(height * target);
  else cropHeight = Math.round(width / target);
  const x = Math.floor((width - cropWidth) / 2);
  const y = Math.floor((height - cropHeight) / 2);
  applyCrop(x, y, cropWidth, cropHeight, `Cropped to ${ratioName}`);
 }

 function autoCrop() {
  const context = canvasContext();
  if (!canvasEl || !context) return;
  const { width, height } = canvasEl;
  // Scan a small working copy so 24 MP images do not require a second full-size pixel buffer.
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const scan = document.createElement('canvas');
  scan.width = Math.max(1, Math.round(width * scale));
  scan.height = Math.max(1, Math.round(height * scale));
  const scanContext = scan.getContext('2d', { willReadFrequently: true });
  if (!scanContext) return;
  scanContext.drawImage(canvasEl, 0, 0, scan.width, scan.height);
  const pixels = scanContext.getImageData(0, 0, scan.width, scan.height).data;
  let minX = scan.width;
  let minY = scan.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < scan.height; y++) {
   for (let x = 0; x < scan.width; x++) {
    if (pixels[(y * scan.width + x) * 4 + 3] > 12) {
     minX = Math.min(minX, x);
     minY = Math.min(minY, y);
     maxX = Math.max(maxX, x);
     maxY = Math.max(maxY, y);
    }
   }
  }
  if (maxX < minX || maxY < minY) {
   cropMessage = 'No visible subject was found to crop.';
   return;
  }
  const padX = Math.round((maxX - minX + 1) * 0.08);
  const padY = Math.round((maxY - minY + 1) * 0.08);
  const x = Math.max(0, Math.floor((minX - padX) / scale));
  const y = Math.max(0, Math.floor((minY - padY) / scale));
  const right = Math.min(width, Math.ceil((maxX + padX + 1) / scale));
  const bottom = Math.min(height, Math.ceil((maxY + padY + 1) / scale));
  applyCrop(x, y, right - x, bottom - y, 'Auto-cropped around the visible subject');
 }

 function chooseBackgroundImage(event: Event) {
  const chosen = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!chosen) return;
  if (!chosen.type.startsWith('image/')) {
   onError('Please choose an image file for the background.');
   return;
  }
  if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
  backgroundImageUrl = URL.createObjectURL(chosen);
  background = 'image';
 }

 async function exportImage(copyToClipboard = false) {
  if (!canvasEl) return;
  try {
   const output = document.createElement('canvas');
   output.width = canvasEl.width;
   output.height = canvasEl.height;
   const context = output.getContext('2d');
   if (!context) throw new Error('The export canvas could not be created.');

   if (background === 'white' || (background === 'transparent' && format !== 'png')) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
   } else if (background === 'soft') {
    context.fillStyle = '#f2eee7';
    context.fillRect(0, 0, output.width, output.height);
   } else if (background === 'custom') {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, output.width, output.height);
   } else if (background === 'dark') {
    context.fillStyle = '#23252b';
    context.fillRect(0, 0, output.width, output.height);
   } else if (background === 'gradient') {
    const gradient = context.createLinearGradient(0, 0, output.width, output.height);
    gradient.addColorStop(0, '#f2d6bf');
    gradient.addColorStop(0.52, '#dce7f2');
    gradient.addColorStop(1, '#d8e8d2');
    context.fillStyle = gradient;
    context.fillRect(0, 0, output.width, output.height);
   } else if (background === 'image' && backgroundImageUrl) {
    const image = new Image();
    image.src = backgroundImageUrl;
    await image.decode();
    const scale = Math.max(output.width / image.naturalWidth, output.height / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    context.drawImage(image, (output.width - w) / 2, (output.height - h) / 2, w, h);
   }

   if (shadow > 0) {
    context.save();
    context.shadowColor = `rgba(0,0,0,${Math.min(0.55, shadow / 60)})`;
    context.shadowBlur = shadow;
    context.shadowOffsetY = Math.round(shadow / 4);
    context.drawImage(canvasEl, 0, 0);
    context.restore();
   }
   context.drawImage(canvasEl, 0, 0);

   const mime = `image/${format}`;
   const blob = await new Promise<Blob>((resolve, reject) => {
    output.toBlob((result) => result ? resolve(result) : reject(new Error('The browser could not export this image.')), mime, 0.94);
   });
   if (copyToClipboard) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
     throw new Error('Image clipboard is not supported in this browser. Download the file instead.');
    }
    await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
    cropMessage = `Copied ${format.toUpperCase()} to clipboard`;
    return;
   }
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = `pixelcutout.${format === 'jpeg' ? 'jpg' : format}`;
   link.click();
   setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (error) {
   onError(error instanceof Error ? error.message : 'Image export failed.');
  }
 }

 onMount(() => () => {
  if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
 });
</script>

<svelte:window onkeydown={handleKeydown}/>

<section class="studio" aria-label="Cutout editor">
 <div class="studio-heading">
  <div>
   <strong>Studio editor</strong>
   <small>Refine your cutout and prepare the final image.</small>
  </div>
  <span class="local-tag">LOCAL EDITING</span>
 </div>

 <div class="artboard" class:checker={background === 'transparent'} style={backgroundStyle}>
  <canvas
   bind:this={canvasEl}
   class="edit-canvas"
   class:brush-cursor={ready}
   aria-label="Editable transparent cutout"
   onpointerdown={startStroke}
   onpointermove={moveStroke}
   onpointerup={finishStroke}
   onpointercancel={finishStroke}
   onlostpointercapture={finishStroke}
  ></canvas>
  {#if !ready}<span class="loading">Preparing editor…</span>{/if}
 </div>

 <div class="tool-block">
  <div class="tool-title"><b>Refine edges</b><span>Brush edits are reversible</span></div>
  <div class="tool-row">
   <button class:chosen={tool === 'erase'} onclick={() => tool = 'erase'} disabled={!ready || edgeBusy}>Erase</button>
   <button class:chosen={tool === 'restore'} onclick={() => tool = 'restore'} disabled={!ready || edgeBusy}>Restore</button>
   <span class="row-spacer"></span>
   <button onclick={undo} disabled={!history.length || edgeBusy}>Undo</button>
   <button onclick={redo} disabled={!future.length || edgeBusy}>Redo</button>
   <button onclick={resetEdits} disabled={!ready || edgeBusy}>Reset edits</button>
  </div>
  <label class="slider-label" for="brush-size"><span>Brush size</span><b>{brushSize}px</b></label>
  <input id="brush-size" class="slider" type="range" min="8" max="180" step="2" bind:value={brushSize} disabled={!ready || edgeBusy}/>
  <label class="slider-label" for="edge-softness"><span>Edge feather strength</span><b>{edgeSoftness} / 4</b></label>
  <input id="edge-softness" class="slider" type="range" min="1" max="4" step="1" bind:value={edgeSoftness} disabled={!ready || edgeBusy}/>
  <div class="tool-row edge-actions"><button class="apply-feather" onclick={applyEdgeFeather} disabled={!ready || edgeBusy}>{edgeBusy ? 'Softening edges…' : 'Apply edge feather'}</button></div>
  <small class="hint">Feathering gently reduces opacity along the existing transparent boundary. It does not grow the subject or alter its colours. Each application can be undone.</small>
  <small class="hint">Erase removes pixels from the cutout. Restore paints back pixels from the original AI result. Undo history stores only the image tiles touched by each edit.</small>
 </div>

 <div class="tool-block">
  <div class="tool-title"><b>Background</b><span>Applied only when exporting</span></div>
  <div class="swatches">
   <button class:chosen={background === 'transparent'} onclick={() => background = 'transparent'}><span class="swatch transparent"></span>Transparent</button>
   <button class:chosen={background === 'white'} onclick={() => background = 'white'}><span class="swatch white"></span>White</button>
   <button class:chosen={background === 'soft'} onclick={() => background = 'soft'}><span class="swatch soft"></span>Soft</button>
   <button class:chosen={background === 'dark'} onclick={() => background = 'dark'}><span class="swatch dark"></span>Dark</button>
   <button class:chosen={background === 'gradient'} onclick={() => background = 'gradient'}><span class="swatch gradient"></span>Gradient</button>
   <button class:chosen={background === 'image'} onclick={() => bgInput?.click()}><span class="swatch photo">＋</span>Photo</button>
  </div>
  <input bind:this={bgInput} type="file" accept="image/*" hidden onchange={chooseBackgroundImage}/>
  <label class="color-label">Custom background colour <input type="color" bind:value={backgroundColor} onchange={() => background = 'custom'}/></label>
  <label class="slider-label" for="shadow"><span>Soft shadow</span><b>{shadow}</b></label>
  <input id="shadow" class="slider" type="range" min="0" max="30" step="1" bind:value={shadow}/>
 </div>

 <div class="tool-block">
  <div class="tool-title"><b>Crop and frame</b><span>Center-crop presets</span></div>
  <div class="tool-row crop-row">
   <button onclick={() => cropTo('original')}>Original</button>
   <button onclick={() => cropTo('square')}>1:1</button>
   <button onclick={() => cropTo('portrait')}>4:5</button>
   <button onclick={() => cropTo('story')}>9:16</button>
   <button onclick={() => cropTo('landscape')}>16:9</button>
   <button class="auto-crop" onclick={autoCrop}>Auto crop</button>
  </div>
  {#if cropMessage}<small class="hint" aria-live="polite">{cropMessage}</small>{/if}
 </div>

 <div class="export-row">
  <label for="format">Export format</label>
  <select id="format" bind:value={format}>
   <option value="png">PNG · transparency</option>
   <option value="jpeg">JPEG · smaller file</option>
   <option value="webp">WebP · smaller file</option>
  </select>
  <button class="copy" onclick={() => exportImage(true)}>Copy</button>
  <button class="download" onclick={() => exportImage(false)}>Export image</button>
 </div>
 <small class="footnote">All brush, crop, background and export operations run locally in this browser tab. No edited image is uploaded.</small>
</section>

<style>
 .studio{margin-top:14px;padding:15px;background:#17191e;border:1px solid #ffffff1c;border-radius:14px;color:#f4f4f0}
 .studio-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
 .studio-heading>div{display:flex;flex-direction:column;gap:4px}
 .studio-heading strong{font-size:15px}
 .studio-heading small,.tool-title span,.hint,.footnote{font-size:11px;color:#9fa2a6;line-height:1.5}
 .local-tag{font-size:9px;letter-spacing:1px;color:#b7f477;border:1px solid #b7f47766;border-radius:20px;padding:5px 8px;white-space:nowrap}
 .artboard{height:min(58vw,470px);min-height:260px;border-radius:10px;display:grid;place-items:center;overflow:hidden;background-color:#24262d;background-size:cover;background-position:center}
 .artboard.checker{background-color:#eee;background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
 .edit-canvas{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;touch-action:none;cursor:crosshair}
 .loading{font-size:12px;color:#aaa}
 .tool-block{padding:14px 2px;border-bottom:1px solid #ffffff13}
 .tool-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
 .tool-title b{font-size:12px}
 .tool-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
 .tool-row button,.swatches button,.copy{border:1px solid #ffffff25;border-radius:7px;background:#24262d;color:#c9cbd0;padding:8px 10px;font-size:11px;cursor:pointer}
 button.chosen{border-color:#b7f477;color:#b7f477;background:#b7f47712}
 button:disabled{opacity:.35;cursor:not-allowed}
 .row-spacer{flex:1}
 .slider-label{display:flex;justify-content:space-between;margin:12px 0 5px;color:#c9cbd0;font-size:11px}
 .slider-label b{color:#b7f477}
 .slider{width:100%;accent-color:#b7f477}
 .hint{display:block;margin-top:8px}
 .swatches{display:flex;gap:7px;flex-wrap:wrap}
 .swatches button{display:flex;align-items:center;gap:7px}
 .swatch{display:block;width:19px;height:19px;border-radius:5px;border:1px solid #888}
 .swatch.transparent{background-color:#fff;background-image:linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%);background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0}
 .swatch.white{background:#fff}.swatch.soft{background:#f2eee7}.swatch.dark{background:#23252b}.swatch.gradient{background:linear-gradient(135deg,#f2d6bf,#dce7f2,#d8e8d2)}.swatch.photo{display:grid;place-items:center;color:#111;background:#ddd}
 .color-label{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#c9cbd0;margin-top:10px}
 .color-label input{border:0;background:none;width:34px;height:28px}
 .edge-actions{margin-top:10px}.edge-actions .apply-feather{border-color:#b7f47766;color:#b7f477;background:#b7f47712}.crop-row button{padding:8px 9px}
 .crop-row .auto-crop{border-color:#b7f47766;color:#b7f477}
 .export-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 0 4px}
 .export-row label{font-size:11px;color:#aaa}
 .export-row select{flex:1;min-width:125px;background:#25272e;border:1px solid #ffffff25;border-radius:7px;color:#eee;padding:10px;font-size:11px}
 .copy{padding:10px 13px}
 .download{border:0;border-radius:7px;background:#b7f477;color:#111;padding:10px 14px;font-size:11px;font-weight:800;cursor:pointer}
 .footnote{display:block;margin-top:9px}
 @media(max-width:520px){.studio{padding:11px}.studio-heading{align-items:flex-start}.tool-title{align-items:flex-start}.export-row label{width:100%}.export-row select{min-width:100%}.artboard{min-height:220px}}
</style>
