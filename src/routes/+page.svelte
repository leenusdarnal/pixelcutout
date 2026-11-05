<script lang="ts">
 let file = $state<File | null>(null);
 let original = $state('');
 let cutout = $state('');
 let busy = $state(false);
 let error = $state('');
 let mode = $state('checker');
 let split = $state(50);
 let picker: HTMLInputElement;
 let worker: Worker | undefined;

 function selectImage(nextFile?: File) {
  if (!nextFile) return;

  if (!nextFile.type.startsWith('image/')) {
   error = 'Please choose a supported image file.';
   return;
  }
  if (nextFile.size > 20 * 1024 * 1024) {
   error = 'Please choose an image smaller than 20 MB for reliable browser processing.';
   return;
  }

  worker?.terminate();
  if (original) URL.revokeObjectURL(original);
  if (cutout) URL.revokeObjectURL(cutout);

  file = nextFile;
  original = URL.createObjectURL(nextFile);
  cutout = '';
  error = '';
  busy = true;

  try {
   worker = new Worker(new URL('../lib/workers/remove-background.ts', import.meta.url), { type: 'module' });
   worker.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'result' && event.data.blob instanceof Blob) {
     cutout = URL.createObjectURL(event.data.blob);
     busy = false;
    } else if (event.data?.type === 'error') {
     error = event.data.message || 'Background removal failed. Please try another image.';
     busy = false;
    }
   };
   worker.onerror = () => {
    error = 'The image-processing worker stopped unexpectedly. Please try again in a recent browser.';
    busy = false;
    worker?.terminate();
    worker = undefined;
   };
   worker.postMessage({ type: 'process', file: nextFile });
  } catch {
   error = 'This browser could not start local image processing. Please use a recent version of Chrome, Edge, or Firefox.';
   busy = false;
  }
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
  error = '';
  busy = false;
 }

 onMount(() => {
  return () => {
   worker?.terminate();
   if (original) URL.revokeObjectURL(original);
   if (cutout) URL.revokeObjectURL(cutout);
  };
 });
 import { onMount } from 'svelte';
</script>

<svelte:window onpaste={paste}/>

<div class="shell">
 <header>
  <a href="/" class="brand"><b>P</b> PixelCutout</a>
  <span>● ON-DEVICE PROCESSING</span>
 </header>
 <main>
  <section class="hero">
   <small>PRIVATE BY DESIGN · AI BACKGROUND REMOVAL</small>
   <h1>Make your subject<br/><i>stand out.</i></h1>
   <p>Remove image backgrounds in your browser. Your photos stay on your device.</p>
  </section>

  {#if !original}
   <section class="drop" role="region" aria-label="Image upload drop zone" ondragover={(event) => event.preventDefault()} ondrop={drop}>
    <div class="upload">↑</div>
    <h2>Drop an image here</h2>
    <p>or choose a file from your device</p>
    <button class="primary" onclick={() => picker?.click()}>Select image</button>
    <input bind:this={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={(event) => selectImage(event.currentTarget.files?.[0])}/>
    <small>PNG · JPG · WEBP · Paste with Ctrl/Cmd + V</small>
    <small class="hint">Best results with people and portraits · Max 20 MB</small>
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
       <img src={original} alt="Original photo"/>
      </div>
      <input class="range" type="range" min="0" max="100" bind:value={split} aria-label="Before and after comparison"/>
     {:else}
      <img src={original} alt="Selected photo"/>
     {/if}
     {#if busy}
      <div class="busy" aria-live="polite">
       <div class="spinner"></div>
       <b>Removing background…</b>
       <small>Running AI locally in your browser. First use downloads the model.</small>
      </div>
     {/if}
    </div>
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
   <p>Image processing runs locally in your browser. The model is downloaded from its public model host and cached where supported; your image pixels are not uploaded.</p>
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
.hero{text-align:center;margin-bottom:38px}
.hero h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-3px;margin:18px 0}
.hero i{font-style:normal;color:#b7f477}
.hero p,.drop p{color:#aaa;font-size:14px}
.drop{min-height:310px;border:1px dashed #777;border-radius:20px;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#ffffff05}
.upload{width:48px;height:48px;background:#b7f477;color:#111;border-radius:14px;display:grid;place-items:center;font-size:27px}
.drop h2{margin:16px 0 0}
.drop small{color:#888;margin-top:18px}
.drop .hint{margin-top:8px;color:#aab78f}
.primary,.secondary{border:0;border-radius:10px;padding:12px 20px;font-weight:750;cursor:pointer}
.primary{background:#b7f477;color:#12150e}
.drop .primary{margin:12px}
.secondary{background:#2c2d34;color:white;border:1px solid #ffffff25}
.editor{background:#1b1c22;border:1px solid #ffffff20;border-radius:16px;padding:14px}
.bar{display:flex;justify-content:space-between;align-items:center;padding:6px 3px 13px;color:#aaa;font-size:12px}
.link{background:none;border:0;color:#b7f477;cursor:pointer}
.preview{height:min(58vw,470px);min-height:270px;position:relative;display:grid;place-items:center;overflow:hidden;border-radius:10px}
.preview.checker{background-color:#eee;background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
.preview.light{background:#f5f5f5}
.preview.dark{background:#202126}
.preview>img,.before img{max-width:100%;max-height:100%;object-fit:contain}
.before{position:absolute;inset:0;display:grid;place-items:center;border-right:2px solid #b7f477}
.before img{width:100%;height:100%;object-fit:contain}
.range{position:absolute;bottom:8px;width:90%}
.busy{position:absolute;inset:0;background:#111c;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:20px;text-align:center}
.busy small{color:#bbb;max-width:340px}
.spinner{width:30px;height:30px;border:3px solid #ffffff40;border-top-color:#b7f477;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
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
