<script lang="ts">
 import { onMount } from 'svelte';
 import { releaseImageResources } from '$lib/image/resource-lifecycle.js';
 import { removeColorPixels } from '$lib/image/remove-color.js';
 import { getBackgroundSamplePoint } from '$lib/image/sample-point.js';

 type RemovalMode = 'ai' | 'manual';
 type SampleColor = { r: number; g: number; b: number };

 let file = $state<File | null>(null);
 let original = $state('');
 let cutout = $state('');
 let busy = $state(false);
 let error = $state('');
 let mode = $state('checker');
 let removalMode = $state<RemovalMode>('ai');
 let split = $state(50);
 let tolerance = $state(48);
 let manualColor = $state<SampleColor | null>(null);
 let manualResult = $state('');
 let manualPreview = $state('');
 let manualAppliedKey = $state('');
 let displayCutout = $derived(removalMode === 'manual' ? (manualPreview || manualResult) : cutout);
 let manualCurrentKey = $derived(manualColor ? [manualColor.r, manualColor.g, manualColor.b, tolerance].join(':') : '');
 let canDownload = $derived(removalMode === 'manual' ? Boolean(manualResult && manualAppliedKey && manualAppliedKey === manualCurrentKey) : Boolean(cutout));
 let aiDownloadProgress = $state<number | null>(null);
 let aiDownloadFile = $state('');
 let aiStage = $state<'loading' | 'processing'>('loading');
 let picker = $state<HTMLInputElement | undefined>(undefined);
 let manualImage: HTMLImageElement | null = null;
 let worker: Worker | undefined;
 let selectionRequest = 0;
 let previewRequest = 0;
 let previewTimer: ReturnType<typeof setTimeout> | undefined;
 let processingMode: RemovalMode = 'ai';
 let pendingManualKey = '';

 async function selectImage(nextFile?: File) {
  if (!nextFile) return;
  const request = ++selectionRequest;

  // Clear the picker so the same file can be selected again after Start over.
  if (picker) picker.value = '';

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(nextFile.type)) {
   error = 'Please choose a PNG, JPG, or WebP image.';
   return;
  }
  if (nextFile.size > 20 * 1024 * 1024) {
   error = 'Please choose an image smaller than 20 MB for reliable browser processing.';
   return;
  }

  // Read only the image header; do not decode a full-size bitmap to check its dimensions.
  try {
   const { readImageDimensions, validateImageDimensions } = await import('$lib/image/image-dimensions.js');
   const dimensions = await readImageDimensions(nextFile);
   validateImageDimensions(dimensions);
  } catch (validationError) {
   if (request !== selectionRequest) return;
   error = validationError instanceof Error
    ? validationError.message
    : 'This image could not be validated. Please choose a PNG, JPG, or WebP file.';
   return;
  }

  // Ignore slow validation results when the user has already selected another file or reset.
  if (request !== selectionRequest) return;

  previewRequest += 1;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = undefined;
  releaseImageResources({ worker, objectUrls: [original, cutout, manualResult, manualPreview] });
  worker = undefined;
  manualImage = null;

  file = nextFile;
  original = URL.createObjectURL(nextFile);
  cutout = '';
  manualResult = '';
  manualPreview = '';
  manualAppliedKey = '';
  error = '';
  busy = false;
  aiDownloadProgress = null;
  aiDownloadFile = '';
 }

 function setRemovalMode(nextMode: RemovalMode) {
  if (removalMode === nextMode) return;

  // Stop any active job and release only the transient preview. Keep committed AI/manual results.
  previewRequest += 1;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = undefined;
  releaseImageResources({ worker, objectUrls: [manualPreview] });
  worker = undefined;
  manualPreview = '';
  removalMode = nextMode;
  error = '';
  busy = false;
  aiDownloadProgress = null;
  aiDownloadFile = '';

  // Rebuild a discarded preview when returning to manual mode with an unapplied change.
  if (
   nextMode === 'manual' &&
   manualColor &&
   (!manualResult || manualAppliedKey !== [manualColor.r, manualColor.g, manualColor.b, tolerance].join(':'))
  ) {
   scheduleManualPreview();
  }
 }

 function ensureWorker() {
  if (worker) return;

  const activeWorker = new Worker(new URL('../lib/workers/remove-background.ts', import.meta.url), { type: 'module' });
  worker = activeWorker;
  activeWorker.onmessage = (event: MessageEvent) => {
   // Ignore queued events from a worker that was replaced, cancelled, or terminated.
   if (worker !== activeWorker) return;

   if (event.data?.type === 'download-progress') {
    const value = Number(event.data.progress);
    aiDownloadProgress = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
    aiDownloadFile = String(event.data.file || 'model asset');
   } else if (event.data?.type === 'status') {
    if (event.data.stage === 'processing') {
     aiStage = 'processing';
     aiDownloadProgress = null;
    } else {
     aiStage = 'loading';
    }
   } else if (event.data?.type === 'result' && event.data.blob instanceof Blob) {
    const resultUrl = URL.createObjectURL(event.data.blob);
    if (processingMode === 'manual') {
     releaseImageResources({ objectUrls: [manualResult, manualPreview] });
     manualResult = resultUrl;
     manualPreview = '';
     manualAppliedKey = pendingManualKey;
    } else {
     releaseImageResources({ objectUrls: [cutout] });
     cutout = resultUrl;
    }
    busy = false;
    aiDownloadProgress = null;
    aiDownloadFile = '';
   } else if (event.data?.type === 'error') {
    error = event.data.message || 'Background removal failed. Please try another image.';
    busy = false;
    aiDownloadProgress = null;
    aiDownloadFile = '';
   }
  };

  activeWorker.onerror = () => {
   if (worker !== activeWorker) return;
   error = 'The image-processing worker stopped unexpectedly. Please try again in a recent browser.';
   busy = false;
   aiDownloadProgress = null;
   releaseImageResources({ worker: activeWorker });
   worker = undefined;
  };
 }

 function beginProcessing(message: Record<string, unknown>) {
  if (!file) return;

  processingMode = message.type === 'process-manual' ? 'manual' : 'ai';
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = undefined;
  previewRequest += 1;
  error = '';
  busy = true;
  aiDownloadProgress = null;
  aiDownloadFile = '';
  aiStage = 'loading';

  try {
   ensureWorker();
   worker?.postMessage({ ...message, file });
  } catch {
   error = 'This browser could not start local image processing. Please use a recent version of Chrome, Edge, or Firefox.';
   busy = false;
  }
 }

 function removeWithAi() {
  beginProcessing({ type: 'process-ai' });
 }

 function cancelProcessing() {
  releaseImageResources({ worker });
  worker = undefined;
  busy = false;
  aiDownloadProgress = null;
  aiDownloadFile = '';
  error = 'Processing cancelled.';
 }

 async function loadManualSourceImage(): Promise<HTMLImageElement> {
  if (manualImage && manualImage.src === original && manualImage.complete && manualImage.naturalWidth) {
   return manualImage;
  }

  const image = new Image();
  image.src = original;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) {
   throw new Error('The selected image could not be decoded for colour sampling.');
  }
  manualImage = image;
  return image;
 }

 async function pickBackgroundColor(event: MouseEvent) {
  const visibleImage = (event.currentTarget as HTMLElement).querySelector('img');
  if (!visibleImage || !visibleImage.naturalWidth || !visibleImage.naturalHeight) return;

  let x: number;
  let y: number;

  try {
   ({ x, y } = getBackgroundSamplePoint({
    imageWidth: visibleImage.naturalWidth,
    imageHeight: visibleImage.naturalHeight,
    bounds: visibleImage.getBoundingClientRect(),
    clientX: event.clientX,
    clientY: event.clientY,
    keyboardActivation: event.detail === 0
   }));
   const image = await loadManualSourceImage();
   const canvas = document.createElement('canvas');
   canvas.width = 1;
   canvas.height = 1;
   const context = canvas.getContext('2d', { willReadFrequently: true });
   if (!context) throw new Error('This browser could not sample the image colour.');

   context.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
   const pixel = context.getImageData(0, 0, 1, 1).data;
   previewRequest += 1;
   if (previewTimer) clearTimeout(previewTimer);
   releaseImageResources({ objectUrls: [manualPreview, manualResult] });
   manualPreview = '';
   manualResult = '';
   manualAppliedKey = '';
   manualColor = { r: pixel[0], g: pixel[1], b: pixel[2] };
   error = '';
   scheduleManualPreview();
   canvas.width = 0;
   canvas.height = 0;
  } catch (sampleError) {
   error = sampleError instanceof Error ? sampleError.message : 'This browser could not sample the image colour.';
  }
 }

 function scheduleManualPreview() {
  if (!file || !manualColor || removalMode !== 'manual') return;
  previewRequest += 1;
  const request = previewRequest;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
   previewTimer = undefined;
   void previewManualRemoval(request);
  }, 120);
 }

 async function previewManualRemoval(request: number) {
  if (!file || !manualColor || removalMode !== 'manual') return;
  const color = { ...manualColor };
  const previewTolerance = tolerance;
  let canvas: HTMLCanvasElement | null = null;
  let frame: ImageData | null = null;

  try {
   const image = await loadManualSourceImage();
   if (request !== previewRequest || removalMode !== 'manual') return;

   const maxSide = 512;
   const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
   const width = Math.max(1, Math.round(image.naturalWidth * scale));
   const height = Math.max(1, Math.round(image.naturalHeight * scale));
   canvas = document.createElement('canvas');
   canvas.width = width;
   canvas.height = height;
   const context = canvas.getContext('2d', { willReadFrequently: true });
   if (!context) throw new Error('This browser could not create a manual-removal preview.');

   context.drawImage(image, 0, 0, width, height);
   frame = context.getImageData(0, 0, width, height);
   removeColorPixels(frame.data, color, previewTolerance);
   context.putImageData(frame, 0, 0);
   const blob = await new Promise<Blob | null>((resolve) => canvas?.toBlob(resolve, 'image/png'));
   if (!blob) throw new Error('This browser could not create the manual-removal preview.');
   if (request !== previewRequest || removalMode !== 'manual') return;

   releaseImageResources({ objectUrls: [manualPreview] });
   manualPreview = URL.createObjectURL(blob);
  } catch (previewError) {
   if (request !== previewRequest) return;
   error = previewError instanceof Error ? previewError.message : 'Manual-removal preview failed.';
  } finally {
   frame?.data.fill(0);
   if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
   }
  }
 }

 function chooseManualColorAgain() {
  previewRequest += 1;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = undefined;
  releaseImageResources({ objectUrls: [manualPreview, manualResult] });
  manualPreview = '';
  manualResult = '';
  manualAppliedKey = '';
  manualColor = null;
 }

 function removeWithoutAi() {
  if (!manualColor) {
   error = 'Click the background in the image to choose a colour first.';
   return;
  }

  pendingManualKey = [manualColor.r, manualColor.g, manualColor.b, tolerance].join(':');
  beginProcessing({
   type: 'process-manual',
   color: manualColor,
   tolerance
  });
 }

 function drop(event: DragEvent) {
  event.preventDefault();
  selectImage(event.dataTransfer?.files?.[0]);
 }

 function paste(event: ClipboardEvent) {
  const imageFile = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'));
  if (imageFile) selectImage(imageFile);
 }

 function download() {
  const result = removalMode === 'manual' ? manualResult : cutout;
  if (!result) return;
  const anchor = document.createElement('a');
  anchor.href = result;
  anchor.download = 'pixelcutout.png';
  anchor.click();
 }

 function reset() {
  selectionRequest += 1;
  previewRequest += 1;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = undefined;
  releaseImageResources({ worker, objectUrls: [original, cutout, manualResult, manualPreview] });
  worker = undefined;
  manualImage = null;
  file = null;
  original = '';
  cutout = '';
  manualResult = '';
  manualPreview = '';
  manualAppliedKey = '';
  manualColor = null;
  error = '';
  busy = false;
  aiDownloadProgress = null;
  aiDownloadFile = '';
  if (picker) picker.value = '';
 }

 onMount(() => {
  return () => {
   selectionRequest += 1;
   previewRequest += 1;
   if (previewTimer) clearTimeout(previewTimer);
   releaseImageResources({ worker, objectUrls: [original, cutout, manualResult, manualPreview] });
   manualImage = null;
  };
 });
</script>

<svelte:window onpaste={paste}/>

<div class="shell">
 <header>
  <a href="/" class="brand"><b>P</b> PixelCutout</a>
  <span>● ON-DEVICE PROCESSING</span>
 </header>
 <main>
  <section class="hero">
   <small>PRIVATE BY DESIGN · ONE IMAGE AT A TIME</small>
   <h1>Make your subject<br/><i>stand out.</i></h1>
   <p>Remove backgrounds automatically with AI, or use manual colour removal for simple backgrounds.</p>
  </section>

  

  {#if !original}
   <section class="drop" aria-label="Image upload drop zone" ondragover={(event) => event.preventDefault()} ondrop={drop}>
    <div class="upload">↑</div>
    <h2>Drop an image here</h2>
    <p>or choose a file from your device</p>
    <button class="primary" onclick={() => picker?.click()}>Select image</button>
    <input bind:this={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={(event) => selectImage(event.currentTarget.files?.[0])}/>
    <small>PNG · JPG · WEBP · Paste with Ctrl/Cmd + V</small>
    <small class="hint">Maximum image size: 20 MB</small>
   </section>
  {:else}
   <section class="editor">
    <div class="bar">
     <span>{file?.name}</span>
     <button class="link" onclick={reset}>{displayCutout || cutout ? 'Try another image' : 'Start over'}</button>
    </div>
    <div class="preview {mode}">
     {#if displayCutout}
      <img id="cutout-preview" class="cut" src={displayCutout} alt="Result with the background removed"/>
      <div class="before" style="clip-path:inset(0 {100 - Number(split)}% 0 0)">
       <img id="original-preview" src={original} alt="Original"/>
      </div>
      <span class="comparison-label original-label" aria-hidden="true">Original</span>
      <span class="comparison-label result-label" aria-hidden="true">{removalMode === 'manual' && manualPreview ? 'Manual preview · reduced size' : 'Background removed'}</span>
      <div class="comparison-divider" style="left: {split}%" aria-hidden="true">
       <span class="comparison-handle">↔</span>
      </div>
      <input
       class="range"
       type="range"
       min="0"
       max="100"
       step="1"
       bind:value={split}
       aria-label="Before and after comparison"
       aria-valuetext={`Original ${Number(split)}%, background removed ${100 - Number(split)}%`}
       aria-controls="original-preview cutout-preview"
      />
     {:else if removalMode === 'manual'}
      <button type="button" class="sampler" onclick={(event) => pickBackgroundColor(event)} aria-label="Sample background colour; keyboard activation samples the image centre">
       <img src={original} alt="" aria-hidden="true"/>
      </button>
     {:else}
      <img src={original} alt="Selected"/>
     {/if}
     {#if busy}
      <div class="busy" aria-live="polite">
       <div class="spinner"></div>
       {#if removalMode === 'ai' && aiDownloadProgress !== null}
        <b>Downloading AI model · {aiDownloadProgress}%</b>
        <div class="progress-track" role="progressbar" aria-label="Current AI model file download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={aiDownloadProgress}>
         <span style="width: {aiDownloadProgress}%"></span>
        </div>
        <small>Downloading {aiDownloadFile || 'model asset'} from its public host. Your photo is not uploaded.</small>
       {:else if removalMode === 'ai'}
        <b>{aiStage === 'processing' ? 'Removing background…' : 'Loading AI model…'}</b>
        <small>{aiStage === 'processing' ? 'The AI is processing your image on this device.' : 'Checking the model cache and preparing the AI engine.'}</small>
       {:else}
        <b>Removing selected colour…</b>
        <small>Processing the image on this device without an AI model.</small>
       {/if}
       <button class="link" onclick={cancelProcessing}>Cancel</button>
      </div>
     {/if}
    </div>


    {#if !busy}
     <div class="tool-panel">
      {#if removalMode === 'ai'}
       <button class="primary" onclick={removeWithAi}>Remove background</button>
       <p>AI removal runs locally. The model downloads only after you start removal.</p>
      {:else}
       <p class="tool-instruction">Click a background area to sample its colour. Keyboard activation samples the image centre.</p>
       {#if manualColor}
        <div class="sample-row">
         <span class="swatch" style="background: rgb({manualColor.r}, {manualColor.g}, {manualColor.b})"></span>
         <span>Selected colour: RGB {manualColor.r}, {manualColor.g}, {manualColor.b}</span>
         <button class="link" onclick={chooseManualColorAgain}>Choose again</button>
        </div>
        <label class="tolerance-label" for="tolerance">
         <span>Colour tolerance</span>
         <strong>{tolerance}</strong>
        </label>
        <input id="tolerance" class="tolerance" type="range" min="10" max="150" step="1" value={tolerance} oninput={(event) => { tolerance = Number(event.currentTarget.value); scheduleManualPreview(); }}/>
        <small class="helper">Increase tolerance to remove more shades of the selected colour. Matching colours inside the subject may also become transparent.</small>
        <small class="helper">Preview is reduced to 512 pixels on the longest side. Click Remove selected colour to apply it at full resolution.</small>
        <button class="primary" onclick={removeWithoutAi}>Remove selected colour</button>
       {:else}
        <small class="helper">Manual colour removal works best when the background has a fairly uniform colour.</small>
       {/if}
      {/if}
      <button
       class="link advanced-toggle"
       aria-expanded={removalMode === 'manual'}
       onclick={() => setRemovalMode(removalMode === 'ai' ? 'manual' : 'ai')}
      >
       {removalMode === 'manual' ? 'Use AI removal instead' : 'Advanced: manual colour removal'}
      </button>
     </div>
    {/if}

    <div class="bar">
     <span>Preview background</span>
     <div class="modes">
      <button class:active={mode === 'checker'} onclick={() => mode = 'checker'}>Grid</button>
      <button class:active={mode === 'light'} onclick={() => mode = 'light'}>Light</button>
      <button class:active={mode === 'dark'} onclick={() => mode = 'dark'}>Dark</button>
     </div>
    </div>
    {#if canDownload}
     <div class="actions">
      <button class="primary" onclick={download}>Download PNG</button>
     </div>
    {/if}
   </section>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <aside>
   <b>Your images never leave your device</b>
   <p>Image pixels are processed on this device and are never uploaded. AI mode downloads model and runtime files from public hosts after you click Remove background; those downloads do not contain your photo. Manual colour removal stays entirely on-device and does not load the AI model.</p>
  </aside>
 </main>
 <footer>PIXELCUTOUT <span>Private image editing, powered by your device.</span></footer>
</div>

<style>
:global(*){box-sizing:border-box}
:global(body){margin:0;background:#101114;color:#f5f4f0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
.shell{min-height:100vh;background:radial-gradient(ellipse at 50% 0,#252630,#101114 48rem)}
header{height:72px;border-bottom:1px solid #ffffff16;display:flex;align-items:center;justify-content:space-between;padding:0 max(5vw,22px)}
header span,.hero small{font-size:10px;letter-spacing:1.5px;color:#b7f477;font-weight:800}
.brand{color:white;text-decoration:none;font-weight:800;display:flex;align-items:center;gap:10px}
.brand b{background:#b7f477;color:#111;border-radius:8px;padding:6px 10px}
main{max-width:820px;margin:auto;padding:70px 22px 48px}
.hero{text-align:center;margin-bottom:30px}
.hero h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-3px;margin:18px 0}
.hero i{font-style:normal;color:#b7f477}
.hero p,.drop p{color:#aaa;font-size:14px;line-height:1.6}
.drop{min-height:310px;border:1px dashed #777;border-radius:20px;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#ffffff05}
.upload{width:48px;height:48px;background:#b7f477;color:#111;border-radius:14px;display:grid;place-items:center;font-size:27px}
.drop h2{margin:16px 0 0}
.drop small{color:#888;margin-top:18px}
.drop .hint{margin-top:8px;color:#aab78f}
.primary{border:0;border-radius:10px;padding:12px 20px;font-weight:750;cursor:pointer}
.primary{background:#b7f477;color:#12150e}
.drop .primary{margin:12px}
.editor{background:#1b1c22;border:1px solid #ffffff20;border-radius:16px;padding:14px}
.bar{display:flex;justify-content:space-between;align-items:center;padding:6px 3px 13px;color:#aaa;font-size:12px;gap:10px}
.link{background:none;border:0;color:#b7f477;cursor:pointer}
.preview{height:min(58vw,470px);min-height:270px;position:relative;display:grid;place-items:center;overflow:hidden;border-radius:10px}
.preview.checker{background-color:#eee;background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
.preview.light{background:#f5f5f5}
.preview.dark{background:#202126}
.preview>img,.before img{max-width:100%;max-height:100%;object-fit:contain}
.sampler{display:grid;place-items:center;max-width:100%;max-height:100%;padding:0;border:0;background:transparent;cursor:crosshair}
.sampler img{display:block;max-width:100%;max-height:100%;object-fit:contain}
.before{position:absolute;inset:0;display:grid;place-items:center}
.before img{width:100%;height:100%;object-fit:contain}
.range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;z-index:4;cursor:ew-resize;touch-action:pan-y}
.range::-webkit-slider-runnable-track{height:100%;background:transparent}
.range::-webkit-slider-thumb{appearance:none;width:44px;height:100%;margin:0;background:transparent;border:0}
.range::-moz-range-track{height:100%;background:transparent}
.range::-moz-range-thumb{width:44px;height:100%;background:transparent;border:0;border-radius:0}
.comparison-divider{position:absolute;top:0;bottom:0;width:2px;transform:translateX(-50%);background:#b7f477;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;box-shadow:0 0 0 1px #1115}
.comparison-handle{display:grid;place-items:center;width:42px;height:42px;border:2px solid #101114;border-radius:50%;background:#b7f477;color:#101114;font-weight:900;font-size:20px;line-height:1;box-shadow:0 2px 12px #0008}
.comparison-label{position:absolute;top:12px;z-index:2;padding:5px 8px;border-radius:6px;background:#101114c9;color:#fff;font-size:10px;font-weight:750;letter-spacing:.04em;pointer-events:none}
.original-label{left:12px}
.result-label{right:12px}
.preview:has(.range:focus-visible) .comparison-handle{outline:3px solid #fff;outline-offset:4px}
.busy{position:absolute;inset:0;background:#111c;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:20px;text-align:center}
.busy small{color:#bbb;max-width:380px;line-height:1.5}
.spinner{width:30px;height:30px;border:3px solid #ffffff40;border-top-color:#b7f477;border-radius:50%;animation:spin 1s linear infinite}
.progress-track{width:min(330px,85%);height:9px;background:#ffffff30;border-radius:20px;overflow:hidden}
.progress-track span{display:block;height:100%;background:#b7f477;border-radius:20px;transition:width .18s ease}
@keyframes spin{to{transform:rotate(360deg)}}
.tool-panel{margin:12px 2px 18px;padding:14px;background:#ffffff08;border:1px solid #ffffff12;border-radius:12px;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.tool-panel>p{font-size:12px;color:#aaa;line-height:1.5;margin:0}
.tool-panel .tool-instruction{color:#eee}
.advanced-toggle{font-size:12px;text-align:left;padding:2px 0}
.sample-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:12px;color:#ddd}
.swatch{display:inline-block;width:22px;height:22px;border:1px solid #ffffff80;border-radius:6px}
.tolerance-label{width:100%;display:flex;justify-content:space-between;color:#ddd;font-size:12px}
.tolerance-label strong{color:#b7f477}
.tolerance{width:100%;accent-color:#b7f477}
.helper{color:#999;font-size:11px;line-height:1.5}
.modes button{background:none;border:1px solid #ffffff22;color:#aaa;border-radius:6px;padding:6px 9px;margin-left:5px;cursor:pointer}
.modes button.active{border-color:#b7f477;color:#b7f477}
.actions{display:flex;justify-content:center;gap:10px;padding:10px}
aside{margin:25px 0;color:#b7f477}
aside b{color:#eee;font-size:13px}
aside p{font-size:12px;line-height:1.6;color:#999}
.error{color:#ff9b9b;text-align:center}
footer{border-top:1px solid #ffffff15;padding:20px 5vw;color:#777;font-size:10px;letter-spacing:1px}
footer span{float:right;letter-spacing:0}
@media(max-width:560px){main{padding-top:48px}.hero h1{letter-spacing:-2px}footer span{float:none;display:block;margin-top:8px}}
</style>
