<script lang="ts">
 import { onMount } from 'svelte';

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
 let aiDownloadProgress = $state<number | null>(null);
 let aiDownloadFile = $state('');
 let aiStage = $state<'loading' | 'processing'>('loading');
 let picker = $state<HTMLInputElement | undefined>(undefined);
 let manualImage = $state<HTMLImageElement | undefined>(undefined);
 let worker: Worker | undefined;

 function selectImage(nextFile?: File) {
  if (!nextFile) return;
  // Clear the picker so the same file can be selected again after Start over.
  if (picker) picker.value = '';

  if (!nextFile.type.startsWith('image/')) {
   error = 'Please choose a supported image file.';
   return;
  }
  if (nextFile.size > 20 * 1024 * 1024) {
   error = 'Please choose an image smaller than 20 MB for reliable browser processing.';
   return;
  }

  worker?.terminate();
  worker = undefined;
  if (original) URL.revokeObjectURL(original);
  if (cutout) URL.revokeObjectURL(cutout);

  file = nextFile;
  original = URL.createObjectURL(nextFile);
  cutout = '';
  manualColor = null;
  error = '';
  busy = false;
  aiDownloadProgress = null;
 }

 function setRemovalMode(nextMode: RemovalMode) {
  if (removalMode === nextMode) return;

  // Stop any active job so an old result cannot appear under the newly selected method.
  worker?.terminate();
  worker = undefined;
  removalMode = nextMode;
  manualColor = null;
  error = '';
  busy = false;
  aiDownloadProgress = null;
  aiDownloadFile = '';

  if (cutout) URL.revokeObjectURL(cutout);
  cutout = '';
 }

 function ensureWorker() {
  if (worker) return;

  worker = new Worker(new URL('../lib/workers/remove-background.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent) => {
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
    if (cutout) URL.revokeObjectURL(cutout);
    cutout = URL.createObjectURL(event.data.blob);
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

  worker.onerror = () => {
   error = 'The image-processing worker stopped unexpectedly. Please try again in a recent browser.';
   busy = false;
   aiDownloadProgress = null;
   worker?.terminate();
   worker = undefined;
  };
 }

 function beginProcessing(message: Record<string, unknown>) {
  if (!file) return;

  if (cutout) URL.revokeObjectURL(cutout);
  cutout = '';
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

 function pickBackgroundColor(event: MouseEvent) {
  const image = event.currentTarget as HTMLImageElement;
  if (!image.naturalWidth || !image.naturalHeight) return;

  const rect = image.getBoundingClientRect();
  const x = Math.max(0, Math.min(image.naturalWidth - 1, Math.floor((event.clientX - rect.left) * image.naturalWidth / rect.width)));
  const y = Math.max(0, Math.min(image.naturalHeight - 1, Math.floor((event.clientY - rect.top) * image.naturalHeight / rect.height)));
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
   error = 'This browser could not sample the image colour.';
   return;
  }

  context.drawImage(image, 0, 0);
  const pixel = context.getImageData(x, y, 1, 1).data;
  manualColor = { r: pixel[0], g: pixel[1], b: pixel[2] };
  error = '';
 }

 function removeWithoutAi() {
  if (!manualColor) {
   error = 'Click the background in the image to choose a colour first.';
   return;
  }

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
  if (!cutout) return;
  const anchor = document.createElement('a');
  anchor.href = cutout;
  anchor.download = 'pixelcutout.png';
  anchor.click();
 }

 async function copy() {
  try {
   const blob = await (await fetch(cutout)).blob();
   await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
   error = 'Clipboard copy is not supported here. Please download the PNG instead.';
  }
 }

 function reset() {
  worker?.terminate();
  worker = undefined;
  if (original) URL.revokeObjectURL(original);
  if (cutout) URL.revokeObjectURL(cutout);
  file = null;
  original = '';
  cutout = '';
  manualColor = null;
  error = '';
  busy = false;
  aiDownloadProgress = null;
  aiDownloadFile = '';
  if (picker) picker.value = '';
 }

 onMount(() => {
  return () => {
   worker?.terminate();
   if (original) URL.revokeObjectURL(original);
   if (cutout) URL.revokeObjectURL(cutout);
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
   <small>PRIVATE BY DESIGN · TWO WAYS TO REMOVE BACKGROUNDS</small>
   <h1>Make your subject<br/><i>stand out.</i></h1>
   <p>Choose automatic AI removal or a no-AI colour tool. Your photos stay on your device.</p>
  </section>

  <section class="method">
   <h2>Choose your method</h2>
   <div class="method-options">
    <button class:active={removalMode === 'ai'} aria-pressed={removalMode === 'ai'} onclick={() => setRemovalMode('ai')}>
     <strong>AI automatic</strong>
     <small>Automatically finds the main subject. The model downloads only when you use it.</small>
    </button>
    <button class:active={removalMode === 'manual'} aria-pressed={removalMode === 'manual'} onclick={() => setRemovalMode('manual')}>
     <strong>Without AI</strong>
     <small>Choose a background colour yourself. Best for plain or simple backgrounds.</small>
    </button>
   </div>
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
     <button class="link" onclick={reset}>Start over</button>
    </div>
    <div class="preview {mode}">
     {#if cutout}
      <img class="cut" src={cutout} alt="Cutout with transparent background"/>
      <div class="before" style="clip-path:inset(0 {100 - Number(split)}% 0 0)">
       <img src={original} alt="Original"/>
      </div>
      <input class="range" type="range" min="0" max="100" bind:value={split} aria-label="Before and after comparison"/>
     {:else if removalMode === 'manual'}
      <img bind:this={manualImage} class="manual-target" src={original} alt="Selected image. Click the background colour you want to remove." onclick={pickBackgroundColor}/>
     {:else}
      <img src={original} alt="Selected image"/>
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
      </div>
     {/if}
    </div>

    {#if !cutout && !busy}
     <div class="tool-panel">
      {#if removalMode === 'ai'}
       <button class="primary" onclick={removeWithAi}>Remove background with AI</button>
       <p>On first use, the AI model must be downloaded. A percentage indicator will show the download progress.</p>
      {:else}
       <p class="tool-instruction">Click a background area in the image above to sample its colour.</p>
       {#if manualColor}
        <div class="sample-row">
         <span class="swatch" style="background: rgb({manualColor.r}, {manualColor.g}, {manualColor.b})"></span>
         <span>Selected colour: RGB {manualColor.r}, {manualColor.g}, {manualColor.b}</span>
         <button class="link" onclick={() => manualColor = null}>Choose again</button>
        </div>
        <label class="tolerance-label" for="tolerance">
         <span>Colour tolerance</span>
         <strong>{tolerance}</strong>
        </label>
        <input id="tolerance" class="tolerance" type="range" min="10" max="150" step="1" bind:value={tolerance}/>
        <small class="helper">Increase tolerance to remove more shades of the selected colour. Matching colours inside the subject may also become transparent.</small>
        <button class="primary" onclick={removeWithoutAi}>Remove selected colour</button>
       {:else}
        <small class="helper">This method does not download an AI model. It works best when the background has a fairly uniform colour.</small>
       {/if}
      {/if}
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
    {#if cutout}
     <div class="actions">
      <button class="primary" onclick={download}>Download PNG</button>
      <button class="secondary" onclick={copy}>Copy cutout</button>
     </div>
    {/if}
   </section>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <aside>
   <b>Your images never leave your device</b>
   <p>Both methods process image pixels locally in your browser. AI mode downloads model files when needed, but your photo is never sent to the model host or an application server. Without AI, PixelCutout removes colours you select and does not download model files.</p>
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
.method{margin:0 0 18px}
.method h2{font-size:13px;color:#ddd;margin:0 0 10px}
.method-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.method-options button{background:#1b1c22;border:1px solid #ffffff20;color:#f5f4f0;border-radius:12px;padding:14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:7px}
.method-options button.active{border-color:#b7f477;box-shadow:inset 0 0 0 1px #b7f477}
.method-options strong{font-size:14px}
.method-options small{font-size:11px;color:#aaa;line-height:1.5}
.drop{min-height:310px;border:1px dashed #777;border-radius:20px;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#ffffff05}
.upload{width:48px;height:48px;background:#b7f477;color:#111;border-radius:14px;display:grid;place-items:center;font-size:27px}
.drop h2{margin:16px 0 0}
.drop small{color:#888;margin-top:18px}
.drop .hint{margin-top:8px;color:#aab78f}
.primary,.secondary{border:0;border-radius:10px;padding:12px 20px;font-weight:750;cursor:pointer}
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
.preview>img.manual-target{cursor:crosshair}
.before{position:absolute;inset:0;display:grid;place-items:center;border-right:2px solid #b7f477}
.before img{width:100%;height:100%;object-fit:contain}
.range{position:absolute;bottom:8px;width:90%}
.busy{position:absolute;inset:0;background:#111c;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:20px;text-align:center}
.busy small{color:#bbb;max-width:380px;line-height:1.5}
.spinner{width:30px;height:30px;border:3px solid #ffffff40;border-top-color:#b7f477;border-radius:50%;animation:spin 1s linear infinite}
.progress-track{width:min(330px,85%);height:9px;background:#ffffff30;border-radius:20px;overflow:hidden}
.progress-track span{display:block;height:100%;background:#b7f477;border-radius:20px;transition:width .18s ease}
@keyframes spin{to{transform:rotate(360deg)}}
.tool-panel{margin:12px 2px 18px;padding:14px;background:#ffffff08;border:1px solid #ffffff12;border-radius:12px;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.tool-panel>p{font-size:12px;color:#aaa;line-height:1.5;margin:0}
.tool-panel .tool-instruction{color:#eee}
.sample-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:12px;color:#ddd}
.swatch{display:inline-block;width:22px;height:22px;border:1px solid #ffffff80;border-radius:6px}
.tolerance-label{width:100%;display:flex;justify-content:space-between;color:#ddd;font-size:12px}
.tolerance-label strong{color:#b7f477}
.tolerance{width:100%;accent-color:#b7f477}
.helper{color:#999;font-size:11px;line-height:1.5}
.modes button{background:none;border:1px solid #ffffff22;color:#aaa;border-radius:6px;padding:6px 9px;margin-left:5px;cursor:pointer}
.modes button.active{border-color:#b7f477;color:#b7f477}
.actions{display:flex;justify-content:center;gap:10px;padding:10px}
.secondary{background:#2c2d34;color:white;border:1px solid #ffffff25}
aside{margin:25px 0;color:#b7f477}
aside b{color:#eee;font-size:13px}
aside p{font-size:12px;line-height:1.6;color:#999}
.error{color:#ff9b9b;text-align:center}
footer{border-top:1px solid #ffffff15;padding:20px 5vw;color:#777;font-size:10px;letter-spacing:1px}
footer span{float:right;letter-spacing:0}
@media(max-width:560px){main{padding-top:48px}.hero h1{letter-spacing:-2px}.method-options{grid-template-columns:1fr}footer span{float:none;display:block;margin-top:8px}}
</style>
