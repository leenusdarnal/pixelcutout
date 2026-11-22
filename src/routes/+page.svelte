<script lang="ts">
 import { onMount } from 'svelte';
 import { releaseImageResources } from '#lib/image/resource-lifecycle.js';
 import { removeColorPixels } from '#lib/image/remove-color.js';
 import { getBackgroundSamplePoint } from '#lib/image/sample-point.js';

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
 let dragActive = $state(false);

 let displayCutout = $derived(removalMode === 'manual' ? (manualPreview || manualResult) : cutout);
 let manualCurrentKey = $derived(manualColor ? [manualColor.r, manualColor.g, manualColor.b, tolerance].join(':') : '');
 let canDownload = $derived(removalMode === 'manual'
  ? Boolean(manualResult && manualAppliedKey && manualAppliedKey === manualCurrentKey)
  : Boolean(cutout));

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
  error = '';
  dragActive = false;

  if (picker) picker.value = '';

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(nextFile.type)) {
   error = 'Please choose a PNG, JPG, or WebP image.';
   return;
  }
  if (nextFile.size > 20 * 1024 * 1024) {
   error = 'Please choose an image smaller than 20 MB for reliable browser processing.';
   return;
  }

  try {
   const { readImageDimensions, validateImageDimensions } = await import('#lib/image/image-dimensions.js');
   const dimensions = await readImageDimensions(nextFile);
   validateImageDimensions(dimensions);
  } catch (validationError) {
   if (request !== selectionRequest) return;
   error = validationError instanceof Error
    ? validationError.message
    : 'This image could not be validated. Please choose a PNG, JPG, or WebP file.';
   return;
  }

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
  busy = false;
  aiDownloadProgress = null;
  aiDownloadFile = '';
  manualColor = null;
  removalMode = 'ai';
 }

 function setRemovalMode(nextMode: RemovalMode) {
  if (removalMode === nextMode) return;

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
  error = 'Processing cancelled. You can start again whenever you are ready.';
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

 function dragEnter(event: DragEvent) {
  event.preventDefault();
  dragActive = true;
 }

 function dragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dragActive = true;
 }

 function dragLeave(event: DragEvent) {
  event.preventDefault();
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && (event.currentTarget as HTMLElement).contains(nextTarget)) return;
  dragActive = false;
 }

 function drop(event: DragEvent) {
  event.preventDefault();
  dragActive = false;
  const droppedFiles = event.dataTransfer?.files;
  if (!droppedFiles?.length) return;
  if (droppedFiles.length > 1) {
   error = 'PixelCutout works with one image at a time. Please drop a single image.';
   return;
  }
  selectImage(droppedFiles[0]);
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
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
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
  dragActive = false;
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

<div class="app-shell">
 <header class="topbar">
  <div class="topbar-inner">
   <a href="/" class="brand" aria-label="PixelCutout home">
    <span class="brand-mark" aria-hidden="true">P</span>
    <span>PixelCutout</span>
   </a>
   <div class="privacy-pill">
    <span class="privacy-dot" aria-hidden="true"></span>
    Images stay on your device
   </div>
  </div>
 </header>

 <main class="page">
  <section class="hero">
   <span class="eyebrow"><span class="eyebrow-line" aria-hidden="true"></span> Private background removal</span>
   <h1>Keep the subject.<br/><span>Lose the background.</span></h1>
   <p>Remove backgrounds with AI in your browser. Your original image never leaves this device.</p>
  </section>

  {#if !original}
   <section
    class="upload-card"
    class:drag-active={dragActive}
    aria-labelledby="upload-title"
    aria-describedby="upload-help"
    ondragenter={dragEnter}
    ondragover={dragOver}
    ondragleave={dragLeave}
    ondrop={drop}
   >
    <div class="upload-illustration" aria-hidden="true">
     <svg viewBox="0 0 48 48" fill="none">
      <path d="M24 31V10m0 0-8 8m8-8 8 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 29v7a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
     </svg>
    </div>
    <h2 id="upload-title">Drop an image here</h2>
    <p class="upload-subtitle">or choose a file from your device</p>
    <button class="primary-button" type="button" onclick={() => picker?.click()}>
     Choose an image
     <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <input
     bind:this={picker}
     type="file"
     accept="image/png,image/jpeg,image/webp"
     aria-label="Choose a PNG, JPG, or WebP image"
     hidden
     onchange={(event) => selectImage(event.currentTarget.files?.[0])}
    />
    <div class="file-specs" aria-label="Supported formats and file limit">
     <span>PNG</span><span>JPG</span><span>WEBP</span><i aria-hidden="true"></i><span>Up to 20 MB</span>
    </div>
    <p id="upload-help" class="upload-help">You can also paste an image with Ctrl/Cmd + V. One image at a time.</p>
   </section>
  {:else}
   <section class="workspace" aria-label="Background removal workspace">
    <div class="canvas-panel">
     <div class="canvas-heading">
      <div class="file-summary">
       <span class="file-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><path d="m6 17 4.2-4.2a1.2 1.2 0 0 1 1.7 0L14 15l1.6-1.6a1.2 1.2 0 0 1 1.7 0L19 15.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
       </span>
       <span class="file-text">
        <strong title={file?.name}>{file?.name}</strong>
        <small>{file?.type.replace('image/', '').toUpperCase()} image · On this device</small>
       </span>
      </div>
      <button class="secondary-button" type="button" onclick={reset}>Replace image</button>
     </div>

     <div
      class="preview-stage"
      class:checker={mode === 'checker'}
      class:light={mode === 'light'}
      class:dark={mode === 'dark'}
      class:processing={busy}
     >
      {#if displayCutout}
       <img id="cutout-preview" class="preview-image" src={displayCutout} alt="Background-removed result on the selected preview background"/>
       <div class="before" style="clip-path:inset(0 {100 - Number(split)}% 0 0)">
        <img id="original-preview" class="preview-image" src={original} alt="Original image"/>
       </div>
       <span class="comparison-label original-label" aria-hidden="true">Original</span>
       <span class="comparison-label result-label" aria-hidden="true">
        {removalMode === 'manual' && manualPreview ? 'Manual preview' : 'Background removed'}
       </span>
       <div class="comparison-divider" style="left: {split}%" aria-hidden="true">
        <span class="comparison-handle">↔</span>
       </div>
       <input
        class="comparison-range"
        type="range"
        min="0"
        max="100"
        step="1"
        bind:value={split}
        aria-label="Before and after comparison"
        aria-valuetext={'Original ' + Number(split) + '%, background removed ' + (100 - Number(split)) + '%'}
        aria-controls="original-preview cutout-preview"
       />
      {:else if removalMode === 'manual'}
       <button
        type="button"
        class="sampler"
        onclick={(event) => pickBackgroundColor(event)}
        aria-label="Sample a background colour from the image. Keyboard activation samples the centre."
       >
        <img class="preview-image" src={original} alt="Selected image for background colour sampling"/>
       </button>
      {:else}
       <img class="preview-image" src={original} alt="Selected original image"/>
      {/if}

      {#if busy}
       <div class="processing-overlay" role="status" aria-live="polite" aria-atomic="true">
        <div class="spinner" aria-hidden="true"></div>
        {#if removalMode === 'ai' && aiDownloadProgress !== null}
         <strong>Downloading AI model · {aiDownloadProgress}%</strong>
         <div class="progress-track" role="progressbar" aria-label="AI model file download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={aiDownloadProgress}>
          <span style="width: {aiDownloadProgress}%"></span>
         </div>
         <p>Downloading {aiDownloadFile || 'model assets'} from its public host. Your photo is not uploaded.</p>
        {:else if removalMode === 'ai'}
         <strong>{aiStage === 'processing' ? 'Removing the background…' : 'Preparing the AI model…'}</strong>
         <p>{aiStage === 'processing' ? 'Your image is being processed on this device.' : 'The model is loaded only after you start removal.'}</p>
        {:else}
         <strong>Removing the selected colour…</strong>
         <p>Processing the original image on this device.</p>
        {/if}
        <button class="overlay-action" type="button" onclick={cancelProcessing}>Cancel</button>
       </div>
      {/if}
     </div>

     <div class="canvas-toolbar">
      <div class="toolbar-label">
       <strong>Preview background</strong>
       {#if displayCutout}
        <span class="result-chip">
         <span class="result-dot" aria-hidden="true"></span>
         {removalMode === 'manual' && manualPreview && !manualResult ? 'Preview only' : 'Result ready'}
        </span>
       {/if}
      </div>
      <div class="segmented-control" role="group" aria-label="Preview background colour">
       <button type="button" class:active={mode === 'checker'} aria-pressed={mode === 'checker'} onclick={() => mode = 'checker'}>Checker</button>
       <button type="button" class:active={mode === 'light'} aria-pressed={mode === 'light'} onclick={() => mode = 'light'}>Light</button>
       <button type="button" class:active={mode === 'dark'} aria-pressed={mode === 'dark'} onclick={() => mode = 'dark'}>Dark</button>
      </div>
     </div>
    </div>

    <aside class="control-panel" aria-label="Background removal controls">
     {#if busy}
      <section class="control-card working-card">
       <span class="control-kicker">IN PROGRESS</span>
       <h2>Working on your image</h2>
       <p>Keep this tab open while PixelCutout finishes processing. Your image remains on this device.</p>
      </section>
     {:else if removalMode === 'ai'}
      <section class="control-card">
       <span class="control-kicker">RECOMMENDED</span>
       <h2>Automatic AI removal</h2>
       <p>Start with AI for people, pets, products and everyday objects.</p>
       <button class="primary-button full-width" type="button" onclick={removeWithAi}>
        Remove background
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
       </button>
       <p class="action-note">The model downloads only after you start. Image pixels stay local.</p>
      </section>
      <div class="secondary-tool">
       <span>For a plain, evenly coloured background</span>
       <button class="text-action" type="button" onclick={() => setRemovalMode('manual')}>Use manual colour removal <span aria-hidden="true">→</span></button>
      </div>
     {:else}
      <section class="control-card manual-card">
       <span class="control-kicker">ADVANCED TOOL</span>
       <h2>Manual colour removal</h2>
       <p>Best for simple backgrounds with one fairly consistent colour.</p>
       {#if manualColor}
        <div class="sample-row">
         <span class="swatch" style="background: rgb({manualColor.r}, {manualColor.g}, {manualColor.b})" aria-hidden="true"></span>
         <div class="sample-copy">
          <strong>Selected background colour</strong>
          <span>RGB {manualColor.r}, {manualColor.g}, {manualColor.b}</span>
         </div>
         <button class="text-action compact" type="button" onclick={chooseManualColorAgain}>Choose again</button>
        </div>
        <label class="tolerance-label" for="tolerance">
         <span>Colour tolerance</span>
         <strong>{tolerance}</strong>
        </label>
        <input
         id="tolerance"
         class="tolerance"
         type="range"
         min="10"
         max="150"
         step="1"
         value={tolerance}
         oninput={(event) => { tolerance = Number(event.currentTarget.value); scheduleManualPreview(); }}
        />
        <p class="helper">Higher tolerance removes a wider range of similar shades. Matching colours inside the subject may also become transparent.</p>
        <p class="helper">The preview is reduced to 512 px on the longest side. Applying it uses the full-resolution original.</p>
        <button class="primary-button full-width" type="button" onclick={removeWithoutAi}>Apply at full resolution</button>
       {:else}
        <div class="sample-instruction">
         <span class="sample-number">1</span>
         <p>Click a background area in the image to sample its colour. Keyboard activation samples the centre.</p>
        </div>
        <p class="helper">The image preview is ready for colour sampling.</p>
       {/if}
      </section>
      <button class="text-action back-action" type="button" onclick={() => setRemovalMode('ai')}>← Back to AI removal</button>
     {/if}

     {#if canDownload && !busy}
      <section class="download-card">
       <div class="download-ready">
        <span class="download-check" aria-hidden="true">
         <svg viewBox="0 0 20 20" fill="none"><path d="m5 10 3.2 3.2L15 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span>
         <strong>Transparent cutout is ready</strong>
         <small>Full resolution · PNG</small>
        </span>
       </div>
       <button class="primary-button full-width" type="button" onclick={download}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 15v2h12v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Download transparent PNG
       </button>
      </section>
     {/if}

     <section class="privacy-note">
      <span class="privacy-icon" aria-hidden="true">
       <svg viewBox="0 0 24 24" fill="none"><path d="M12 3 19 6v5.5c0 4.4-2.8 7.6-7 9.5-4.2-1.9-7-5.1-7-9.5V6l7-3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span>
       <strong>Private by design</strong>
       <small>Image pixels are processed in your browser, never uploaded. AI mode downloads its model and runtime after you choose removal.</small>
      </span>
     </section>
    </aside>
   </section>
  {/if}

  {#if error}
   <div class="error-message" role="alert">
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4.5m0 3h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    <span>{error}</span>
   </div>
  {/if}
 </main>

 <footer class="footer">
  <span>PIXELCUTOUT</span>
  <span>No account. No uploads. One image at a time.</span>
 </footer>
</div>

<style>
:global(:root) {
 color-scheme: light;
 font-synthesis: none;
 --ink-900: hsl(218 32% 17%);
 --ink-700: hsl(216 24% 31%);
 --ink-600: hsl(215 18% 42%);
 --ink-500: hsl(215 16% 49%);
 --surface: hsl(216 33% 98%);
 --surface-2: hsl(216 27% 95%);
 --surface-3: hsl(216 22% 91%);
 --white: hsl(0 0% 100%);
 --line: hsl(216 23% 88%);
 --line-strong: hsl(215 20% 80%);
 --blue-700: hsl(218 86% 40%);
 --blue-600: hsl(218 88% 49%);
 --blue-100: hsl(218 86% 94%);
 --green-700: hsl(155 54% 27%);
 --green-100: hsl(145 45% 93%);
 --red-700: hsl(0 62% 37%);
 --red-100: hsl(0 75% 96%);
 --space-1: 4px;
 --space-2: 8px;
 --space-3: 12px;
 --space-4: 16px;
 --space-5: 24px;
 --space-6: 32px;
 --space-7: 40px;
 --space-8: 48px;
 --radius-md: 10px;
 --radius-lg: 16px;
 --radius-xl: 20px;
}
:global(*) { box-sizing: border-box; }
:global(body) {
 margin: 0;
 background: var(--surface);
 color: var(--ink-900);
 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, "Helvetica Neue", sans-serif;
 font-size: 15px;
 line-height: 1.5;
}
:global(button), :global(input) { font: inherit; }
:global(button) { -webkit-tap-highlight-color: transparent; }
:global(button:focus-visible), :global(input:focus-visible), :global(a:focus-visible) {
 outline: 3px solid hsl(218 95% 55% / 45%);
 outline-offset: 3px;
}
.app-shell { min-height: 100vh; background: linear-gradient(180deg, hsl(214 34% 99%) 0%, var(--surface) 440px); }
.topbar { height: 68px; background: hsl(0 0% 100% / 88%); border-bottom: 1px solid hsl(216 23% 88% / 85%); }
.topbar-inner {
 width: min(1180px, calc(100% - 48px));
 height: 100%;
 margin: 0 auto;
 display: flex;
 align-items: center;
 justify-content: space-between;
}
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink-900); text-decoration: none; font-weight: 700; font-size: 16px; letter-spacing: -.25px; }
.brand-mark {
 width: 30px;
 height: 30px;
 display: grid;
 place-items: center;
 border-radius: 9px;
 color: #fff;
 background: var(--ink-900);
 font-size: 17px;
 font-weight: 750;
}
.privacy-pill {
 display: inline-flex;
 align-items: center;
 gap: 8px;
 padding: 7px 11px;
 border-radius: 999px;
 background: var(--green-100);
 color: var(--green-700);
 font-size: 12px;
 font-weight: 650;
}
.privacy-dot, .result-dot { width: 7px; height: 7px; border-radius: 50%; background: hsl(151 55% 37%); }
.page { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 48px 0 64px; }
.hero { max-width: 680px; margin: 0 auto 36px; text-align: center; }
.eyebrow {
 display: inline-flex;
 align-items: center;
 gap: 9px;
 margin-bottom: 14px;
 color: var(--ink-600);
 font-size: 11px;
 font-weight: 700;
 letter-spacing: .09em;
 text-transform: uppercase;
}
.eyebrow-line { width: 20px; height: 2px; border-radius: 2px; background: var(--blue-600); }
.hero h1 { margin: 0; color: var(--ink-900); font-size: clamp(32px, 4vw, 44px); line-height: 1.08; letter-spacing: -1.8px; font-weight: 750; }
.hero h1 span { color: var(--blue-700); }
.hero p { max-width: 520px; margin: 15px auto 0; color: var(--ink-600); font-size: 15px; line-height: 1.65; }
.upload-card {
 width: min(780px, 100%);
 min-height: 324px;
 margin: 0 auto;
 padding: 38px 26px 30px;
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 border: 1.5px dashed var(--line-strong);
 border-radius: var(--radius-xl);
 background: var(--white);
 box-shadow: 0 8px 30px hsl(218 34% 25% / 5%);
 text-align: center;
 transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease;
}
.upload-card.drag-active {
 border-color: var(--blue-600);
 background: hsl(218 90% 98%);
 box-shadow: 0 0 0 4px hsl(218 88% 49% / 9%), 0 12px 32px hsl(218 34% 25% / 8%);
}
.upload-illustration {
 width: 58px;
 height: 58px;
 margin-bottom: 17px;
 display: grid;
 place-items: center;
 border-radius: 17px;
 background: var(--blue-100);
 color: var(--blue-700);
}
.upload-illustration svg { width: 31px; height: 31px; }
.upload-card h2 { margin: 0; font-size: 20px; line-height: 1.25; font-weight: 700; letter-spacing: -.35px; }
.upload-subtitle { margin: 6px 0 17px; color: var(--ink-600); font-size: 14px; }
.primary-button {
 min-height: 44px;
 display: inline-flex;
 align-items: center;
 justify-content: center;
 gap: 10px;
 padding: 11px 17px;
 border: 1px solid transparent;
 border-radius: 10px;
 color: #fff;
 background: var(--blue-600);
 box-shadow: 0 2px 4px hsl(218 84% 35% / 14%);
 font-size: 14px;
 font-weight: 700;
 cursor: pointer;
 transition: background-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.primary-button:hover { background: var(--blue-700); box-shadow: 0 4px 10px hsl(218 84% 35% / 20%); }
.primary-button:active { transform: translateY(1px); }
.primary-button svg { width: 17px; height: 17px; }
.full-width { width: 100%; }
.file-specs { margin-top: 22px; display: flex; align-items: center; gap: 7px; color: var(--ink-600); font-size: 11px; font-weight: 650; }
.file-specs span:not(:last-child) { padding: 4px 7px; border-radius: 5px; background: var(--surface-2); color: var(--ink-700); letter-spacing: .02em; }
.file-specs i { width: 1px; height: 14px; margin: 0 4px; background: var(--line-strong); }
.upload-help { margin: 12px 0 0; color: var(--ink-500); font-size: 12px; }
.workspace {
 display: grid;
 grid-template-columns: minmax(0, 1fr) 288px;
 align-items: start;
 gap: 24px;
}
.canvas-panel {
 min-width: 0;
 padding: 16px;
 border: 1px solid var(--line);
 border-radius: var(--radius-xl);
 background: var(--white);
 box-shadow: 0 8px 28px hsl(218 34% 25% / 5%);
}
.canvas-heading { min-height: 42px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.file-summary { min-width: 0; display: flex; align-items: center; gap: 10px; }
.file-icon {
 width: 34px;
 height: 34px;
 flex: 0 0 auto;
 display: grid;
 place-items: center;
 border-radius: 9px;
 background: var(--surface-2);
 color: var(--ink-600);
}
.file-icon svg { width: 20px; height: 20px; }
.file-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.file-text strong { max-width: min(420px, 48vw); overflow: hidden; color: var(--ink-900); font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.file-text small { color: var(--ink-500); font-size: 11px; }
.secondary-button {
 min-height: 36px;
 flex: 0 0 auto;
 padding: 8px 11px;
 border: 1px solid var(--line);
 border-radius: 9px;
 color: var(--ink-700);
 background: var(--white);
 font-size: 12px;
 font-weight: 650;
 cursor: pointer;
}
.secondary-button:hover { background: var(--surface-2); border-color: var(--line-strong); }
.preview-stage {
 position: relative;
 height: min(62vh, 540px);
 min-height: 340px;
 display: grid;
 place-items: center;
 overflow: hidden;
 border-radius: 12px;
 background-color: #f0f3f7;
 box-shadow: inset 0 0 0 1px hsl(216 30% 28% / 8%);
}
.preview-stage.checker {
 background-color: #f1f3f6;
 background-image:
  linear-gradient(45deg, #dfe4eb 25%, transparent 25%),
  linear-gradient(-45deg, #dfe4eb 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, #dfe4eb 75%),
  linear-gradient(-45deg, transparent 75%, #dfe4eb 75%);
 background-size: 24px 24px;
 background-position: 0 0, 0 12px, 12px -12px, -12px 0;
}
.preview-stage.light { background: #fbfcfd; }
.preview-stage.dark { background: #222b36; }
.preview-image { display: block; width: 100%; height: 100%; max-width: 100%; max-height: 100%; padding: 18px; object-fit: contain; }
.sampler { width: 100%; height: 100%; display: grid; place-items: center; padding: 0; border: 0; background: transparent; cursor: crosshair; }
.sampler:focus-visible { outline-offset: -5px; }
.sampler img { pointer-events: none; }
.before { position: absolute; inset: 0; display: grid; place-items: center; }
.before img { width: 100%; height: 100%; object-fit: contain; }
.comparison-range {
 position: absolute;
 inset: 0;
 z-index: 4;
 width: 100%;
 height: 100%;
 margin: 0;
 opacity: 0;
 cursor: ew-resize;
 touch-action: pan-y;
}
.comparison-range::-webkit-slider-runnable-track { height: 100%; background: transparent; }
.comparison-range::-webkit-slider-thumb { appearance: none; width: 44px; height: 100%; margin: 0; border: 0; background: transparent; }
.comparison-range::-moz-range-track { height: 100%; background: transparent; }
.comparison-range::-moz-range-thumb { width: 44px; height: 100%; border: 0; border-radius: 0; background: transparent; }
.comparison-divider {
 position: absolute;
 top: 0;
 bottom: 0;
 z-index: 2;
 width: 2px;
 display: flex;
 align-items: center;
 justify-content: center;
 transform: translateX(-50%);
 background: var(--blue-600);
 box-shadow: 0 0 0 1px hsl(0 0% 100% / 30%);
 pointer-events: none;
}
.comparison-handle {
 width: 42px;
 height: 42px;
 display: grid;
 place-items: center;
 border: 2px solid #fff;
 border-radius: 50%;
 color: #fff;
 background: var(--blue-600);
 font-size: 20px;
 font-weight: 800;
 line-height: 1;
 box-shadow: 0 2px 10px hsl(218 30% 18% / 24%);
}
.comparison-label {
 position: absolute;
 top: 13px;
 z-index: 3;
 padding: 6px 9px;
 border-radius: 6px;
 color: #fff;
 background: hsl(218 32% 17% / 88%);
 font-size: 11px;
 font-weight: 700;
 letter-spacing: .01em;
 pointer-events: none;
}
.original-label { left: 13px; }
.result-label { right: 13px; }
.preview-stage:has(.comparison-range:focus-visible) .comparison-handle { outline: 3px solid hsl(218 95% 55% / 55%); outline-offset: 4px; }
.processing-overlay {
 position: absolute;
 inset: 0;
 z-index: 5;
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 gap: 11px;
 padding: 22px;
 color: #fff;
 background: hsl(218 32% 14% / 88%);
 text-align: center;
}
.processing-overlay strong { font-size: 16px; font-weight: 700; }
.processing-overlay p { max-width: 330px; margin: 0; color: hsl(0 0% 100% / 88%); font-size: 13px; line-height: 1.55; }
.spinner { width: 30px; height: 30px; border: 3px solid hsl(0 0% 100% / 30%); border-top-color: #fff; border-radius: 50%; animation: spin .9s linear infinite; }
.progress-track { width: min(320px, 85%); height: 8px; overflow: hidden; border-radius: 99px; background: hsl(0 0% 100% / 24%); }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: #fff; transition: width .18s ease; }
.overlay-action { margin-top: 4px; padding: 7px 12px; border: 1px solid hsl(0 0% 100% / 35%); border-radius: 7px; color: #fff; background: transparent; font-size: 12px; font-weight: 650; cursor: pointer; }
.overlay-action:hover { background: hsl(0 0% 100% / 12%); }
@keyframes spin { to { transform: rotate(360deg); } }
.canvas-toolbar { min-height: 52px; padding: 13px 2px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toolbar-label { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.toolbar-label > strong { color: var(--ink-600); font-size: 12px; font-weight: 650; }
.result-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 7px; border-radius: 6px; background: var(--green-100); color: var(--green-700); font-size: 10px; font-weight: 700; }
.result-dot { width: 6px; height: 6px; }
.segmented-control { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 9px; background: var(--surface-2); }
.segmented-control button { min-height: 29px; padding: 5px 9px; border: 0; border-radius: 7px; color: var(--ink-600); background: transparent; font-size: 11px; font-weight: 600; cursor: pointer; }
.segmented-control button:hover { color: var(--ink-900); }
.segmented-control button.active { color: var(--ink-900); background: #fff; box-shadow: 0 1px 3px hsl(218 30% 20% / 12%); }
.control-panel { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.control-card {
 padding: 20px;
 border: 1px solid var(--line);
 border-radius: var(--radius-lg);
 background: var(--white);
 box-shadow: 0 5px 18px hsl(218 34% 25% / 4%);
}
.control-kicker { color: var(--blue-700); font-size: 10px; font-weight: 800; letter-spacing: .1em; }
.control-card h2 { margin: 9px 0 7px; color: var(--ink-900); font-size: 18px; font-weight: 720; letter-spacing: -.3px; line-height: 1.25; }
.control-card > p { margin: 0; color: var(--ink-600); font-size: 13px; line-height: 1.55; }
.control-card .primary-button { margin-top: 18px; }
.action-note { margin-top: 10px !important; color: var(--ink-500) !important; font-size: 11px !important; line-height: 1.5 !important; }
.secondary-tool { padding: 4px 2px 7px; display: flex; flex-direction: column; gap: 5px; }
.secondary-tool > span { color: var(--ink-500); font-size: 11px; }
.text-action { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 3px 0; border: 0; color: var(--blue-700); background: transparent; font-size: 13px; font-weight: 700; text-align: left; cursor: pointer; }
.text-action:hover { color: var(--blue-700); text-decoration: underline; text-underline-offset: 3px; }
.text-action.compact { font-size: 11px; }
.back-action { margin: -3px 0 0 2px; }
.manual-card { display: flex; flex-direction: column; gap: 10px; }
.manual-card h2 { margin-bottom: -3px; }
.manual-card .primary-button { margin-top: 4px; }
.sample-instruction { display: flex; align-items: flex-start; gap: 10px; margin-top: 6px; padding: 11px; border-radius: 10px; background: var(--surface-2); }
.sample-number { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; color: var(--blue-700); background: var(--blue-100); font-size: 11px; font-weight: 800; }
.sample-instruction p { margin: 1px 0 0; color: var(--ink-700); font-size: 12px; line-height: 1.5; }
.sample-row { display: flex; align-items: center; gap: 9px; width: 100%; padding: 10px; border-radius: 10px; background: var(--surface-2); }
.swatch { width: 26px; height: 26px; flex: 0 0 auto; border: 2px solid #fff; border-radius: 7px; box-shadow: 0 0 0 1px var(--line-strong); }
.sample-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
.sample-copy strong { color: var(--ink-700); font-size: 11px; font-weight: 700; }
.sample-copy span { color: var(--ink-500); font-size: 10px; }
.tolerance-label { width: 100%; display: flex; align-items: baseline; justify-content: space-between; color: var(--ink-700); font-size: 12px; font-weight: 650; }
.tolerance-label strong { color: var(--blue-700); font-size: 13px; font-variant-numeric: tabular-nums; }
.tolerance { width: 100%; margin: 0; accent-color: var(--blue-600); }
.helper { margin: 0 !important; color: var(--ink-500) !important; font-size: 11px !important; line-height: 1.5 !important; }
.download-card { padding: 16px; border: 1px solid hsl(145 35% 82%); border-radius: var(--radius-lg); background: hsl(145 48% 97%); }
.download-ready { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
.download-check { width: 30px; height: 30px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; color: var(--green-700); background: hsl(145 45% 89%); }
.download-check svg { width: 18px; height: 18px; }
.download-ready > span:last-child { display: flex; flex-direction: column; gap: 1px; }
.download-ready strong { color: var(--green-700); font-size: 12px; font-weight: 750; }
.download-ready small { color: var(--ink-600); font-size: 11px; }
.privacy-note { display: flex; align-items: flex-start; gap: 10px; padding: 14px; border-radius: 12px; background: hsl(218 65% 96%); }
.privacy-icon { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; color: var(--blue-700); }
.privacy-icon svg { width: 21px; height: 21px; }
.privacy-note > span:last-child { display: flex; flex-direction: column; gap: 3px; }
.privacy-note strong { color: var(--ink-900); font-size: 12px; font-weight: 700; }
.privacy-note small { color: var(--ink-600); font-size: 11px; line-height: 1.5; }
.error-message {
 width: min(780px, 100%);
 margin: 18px auto 0;
 padding: 11px 13px;
 display: flex;
 align-items: flex-start;
 gap: 9px;
 border-radius: 10px;
 color: var(--red-700);
 background: var(--red-100);
 font-size: 13px;
 line-height: 1.5;
}
.error-message svg { width: 18px; height: 18px; flex: 0 0 auto; margin-top: 1px; }
.footer {
 width: min(1180px, calc(100% - 48px));
 margin: 0 auto;
 padding: 18px 0 24px;
 display: flex;
 justify-content: space-between;
 gap: 15px;
 border-top: 1px solid var(--line);
 color: var(--ink-500);
 font-size: 11px;
}
.footer span:first-child { color: var(--ink-700); font-weight: 750; letter-spacing: .08em; }
@media (max-width: 900px) {
 .workspace { grid-template-columns: minmax(0, 1fr); gap: 16px; }
 .control-panel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
 .control-panel .privacy-note { grid-column: 1 / -1; }
 .control-panel .secondary-tool, .control-panel .back-action { padding-left: 4px; }
}
@media (max-width: 600px) {
 .topbar { height: 60px; }
 .topbar-inner, .page, .footer { width: calc(100% - 32px); }
 .privacy-pill { padding: 6px 8px; font-size: 10px; }
 .page { padding-top: 31px; padding-bottom: 42px; }
 .hero { margin-bottom: 25px; }
 .hero h1 { font-size: 33px; letter-spacing: -1.25px; }
 .hero p { max-width: 340px; margin-top: 11px; font-size: 14px; }
 .upload-card { min-height: 300px; padding: 30px 17px 24px; }
 .workspace { gap: 12px; }
 .canvas-panel { padding: 11px; border-radius: 15px; }
 .canvas-heading { min-height: 39px; margin-bottom: 10px; }
 .file-text strong { max-width: 48vw; font-size: 12px; }
 .secondary-button { min-height: 34px; padding: 7px 9px; font-size: 11px; }
 .preview-stage { height: 72vw; min-height: 250px; max-height: 420px; }
 .preview-image { padding: 12px; }
 .canvas-toolbar { align-items: flex-start; flex-direction: column; gap: 9px; padding-top: 12px; }
 .segmented-control { width: 100%; }
 .segmented-control button { flex: 1; }
 .control-panel { grid-template-columns: minmax(0, 1fr); gap: 11px; }
 .control-panel .privacy-note { grid-column: auto; }
 .control-card { padding: 17px; }
 .footer { flex-direction: column; gap: 5px; }
}
@media (prefers-reduced-motion: reduce) {
 :global(*), :global(*::before), :global(*::after) { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
</style>
