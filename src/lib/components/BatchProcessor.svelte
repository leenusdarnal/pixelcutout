<script lang="ts">
 import { onMount } from 'svelte';
 import { createZip } from '$lib/image/zip-store.js';
 type RGBColor = { r:number; g:number; b:number };
 type Method = 'ai'|'manual';
 type Item = { id:number; file:File; status:'queued'|'processing'|'done'|'error'; result?:Blob; includeInExport?:boolean; message?:string; sampleColor?:RGBColor; sampleTolerance?:number };
 let items=$state<Item[]>([]);
 let running=$state(false);
 let progress=$state(0);
 let modelProgress=$state<number|null>(null);
 let currentName=$state('');
 let error=$state('');
 let method=$state<Method>('ai');
 let selectedSampleId=$state<number|null>(null);
 let previewId=$state<number|null>(null);
 let previewMode=$state<'result'|'original'>('result');
 let previewOriginalUrl=$state('');
 let previewResultUrl=$state('');
 let tolerance=$state(48);
 let sampleUrl=$state('');
 let sampleImage=$state<HTMLImageElement|undefined>(undefined);
 let sampleFile=$derived(items.find((item)=>item.id===selectedSampleId)?.file);
 let selectedItem=$derived(items.find((item)=>item.id===selectedSampleId));
 let picker:HTMLInputElement|undefined;
 let worker:Worker|undefined;
 let nextId=1;
 let cursor=0;
 const completed=$derived(items.filter((item)=>item.status==='done').length);
 const exportCount=$derived(items.filter((item)=>item.status==='done'&&item.result&&item.includeInExport!==false).length);
 const previewItems=$derived(items.filter((item)=>item.status==='done'&&item.result));
 const previewIndex=$derived(previewItems.findIndex((item)=>item.id===previewId));
 const previewItem=$derived(previewItems.find((item)=>item.id===previewId));
 const failed=$derived(items.filter((item)=>item.status==='error').length);
 const totalBytes=$derived(items.reduce((sum,item)=>sum+item.file.size,0));

 function addFiles(list:FileList|File[]){
  error='';
  const files=[...list];
  const accepted=files.filter((f)=>['image/png','image/jpeg','image/webp'].includes(f.type)&&f.size<=20*1024*1024);
  let remaining=Math.max(0,20-items.length);
  let budget=Math.max(0,100*1024*1024-totalBytes);
  const chosen:File[]=[];
  for(const f of accepted){
   if(chosen.length>=remaining||f.size>budget) continue;
   chosen.push(f); budget-=f.size;
  }
  if(accepted.length!==files.length||chosen.length!==accepted.length){
   error='Some files were skipped. Limit: 20 images, 20 MB each and 100 MB total. Use PNG, JPG or WebP.';
  }
  const known=new Set(items.map((i)=>i.file.name+':'+i.file.size+':'+i.file.lastModified));
  items=[...items,...chosen.filter((f)=>!known.has(f.name+':'+f.size+':'+f.lastModified)).map((file)=>({id:nextId++,file,status:'queued' as const}))];
  if(picker) picker.value='';
 }
 function setMethod(next:Method){
  if(running)return;
  method=next;error='';
 }
 function chooseSample(id:number){
  const item=items.find((entry)=>entry.id===id);
  if(!item)return;
  if(sampleUrl)URL.revokeObjectURL(sampleUrl);
  selectedSampleId=id;sampleUrl=URL.createObjectURL(item.file);
 }
 function sampleBackground(event:MouseEvent){
  const image=sampleImage;
  if(!image||!image.naturalWidth||!image.naturalHeight)return;
  const rect=image.getBoundingClientRect();
  const x=Math.max(0,Math.min(image.naturalWidth-1,Math.floor((event.clientX-rect.left)*image.naturalWidth/rect.width)));
  const y=Math.max(0,Math.min(image.naturalHeight-1,Math.floor((event.clientY-rect.top)*image.naturalHeight/rect.height)));
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context){error='This browser could not sample the image colour.';return;}
  context.drawImage(image,x,y,1,1,0,0,1,1);
  const pixel=context.getImageData(0,0,1,1).data;
  items=items.map((item)=>item.id===selectedSampleId?{...item,sampleColor:{r:pixel[0],g:pixel[1],b:pixel[2]},sampleTolerance:item.sampleTolerance??tolerance}:item);error='';
 }
 function drop(event:DragEvent){event.preventDefault();if(event.dataTransfer?.files)addFiles(event.dataTransfer.files);}
 function removeItem(id:number){if(!running){items=items.filter((i)=>i.id!==id);if(previewId===id)closePreview();}}
 function closePreview(){if(previewOriginalUrl)URL.revokeObjectURL(previewOriginalUrl);if(previewResultUrl)URL.revokeObjectURL(previewResultUrl);previewOriginalUrl='';previewResultUrl='';previewId=null;}
 function openPreview(id:number){const item=items.find((entry)=>entry.id===id);if(!item?.result)return;closePreview();previewId=id;previewMode='result';previewOriginalUrl=URL.createObjectURL(item.file);previewResultUrl=URL.createObjectURL(item.result);}
 function movePreview(direction:-1|1){const next=previewItems[previewIndex+direction];if(next)openPreview(next.id);}
 function toggleExport(id:number,include:boolean){items=items.map((item)=>item.id===id?{...item,includeInExport:include}:item);}

 function clearQueue(){if(!running){items=[];progress=0;error='';}}
 function formatSize(bytes:number){return bytes<1048576?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1048576).toFixed(1)+' MB';}
 function safeName(name:string,index:number){
  const base=name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'image';
  return String(index+1).padStart(2,'0')+'-'+base+'-cutout.png';
 }
 function finish(){
  worker?.terminate();worker=undefined;running=false;modelProgress=null;currentName='';
  progress=items.length?Math.round((completed+failed)/items.length*100):0;
 }
 function runNext(){
  while(cursor<items.length&&items[cursor].status!=='queued')cursor++;
  if(cursor>=items.length){finish();return;}
  const index=cursor++;const item=items[index];currentName=item.file.name;
  items[index]={...item,status:'processing'};items=[...items];
  const message=method==='ai'
   ?{type:'process-ai',file:item.file}
   :{type:'process-manual',file:item.file,color:item.sampleColor,tolerance:item.sampleTolerance??tolerance};
  worker?.postMessage(message);
 }
 function startBatch(){
  if(running||!items.some((i)=>i.status==='queued'))return;
  if(method==='manual'){
   const missing=items.filter((item)=>item.status==='queued'&&!item.sampleColor);
   if(missing.length){error=`Select and sample a background colour for each queued image. ${missing.length} image(s) still need a colour.`;return;}
  }
  error='';running=true;progress=0;cursor=0;
  items=items.map((i)=>i.status==='error'?{...i,status:'queued',message:undefined}:i);
  worker=new Worker(new URL('../workers/remove-background.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent)=>{
   const data=event.data;
   if(data?.type==='download-progress'){modelProgress=Number.isFinite(Number(data.progress))?Math.max(0,Math.min(100,Math.round(Number(data.progress)))):0;return;}
   if(data?.type==='status'){if(data.stage==='processing')modelProgress=null;return;}
   const index=items.findIndex((i)=>i.status==='processing');if(index<0)return;
   if(data?.type==='result'&&data.blob instanceof Blob)items[index]={...items[index],status:'done',result:data.blob,includeInExport:true};
   else if(data?.type==='error')items[index]={...items[index],status:'error',message:String(data.message||'Processing failed')};
   else return;
   items=[...items];progress=Math.round((completed+failed)/items.length*100);modelProgress=null;runNext();
  };
  worker.onerror=()=>{
   const index=items.findIndex((i)=>i.status==='processing');
   if(index>=0){items[index]={...items[index],status:'error',message:'The processing worker stopped unexpectedly.'};items=[...items];}
   error='The worker stopped. You can retry the remaining images.';finish();
  };
  runNext();
 }
 function cancelBatch(){
  if(!running)return;worker?.terminate();worker=undefined;
  items=items.map((i)=>i.status==='processing'?{...i,status:'queued'}:i);
  running=false;modelProgress=null;currentName='';
  error='Batch cancelled. Completed images are kept; queued images can be resumed.';
 }
 async function downloadZip(){
  const outputs=items.filter((i)=>i.status==='done'&&i.result&&i.includeInExport!==false);
  if(!outputs.length){error='Select at least one completed image to include in the ZIP.';return;}
  try{
   const entries=await Promise.all(outputs.map(async(i,index)=>({name:safeName(i.file.name,index),data:new Uint8Array(await i.result!.arrayBuffer())})));
   const archive=createZip(entries);const url=URL.createObjectURL(archive);
   const anchor=document.createElement('a');anchor.href=url;anchor.download='pixelcutout-batch.zip';anchor.click();
   window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch{error='The ZIP could not be created. Try a smaller batch.';}
 }
 onMount(()=>()=>{worker?.terminate();if(sampleUrl)URL.revokeObjectURL(sampleUrl);if(previewOriginalUrl)URL.revokeObjectURL(previewOriginalUrl);if(previewResultUrl)URL.revokeObjectURL(previewResultUrl);});
</script>

<section class="batch" aria-label="Batch background removal">
 <div class="heading"><div><small>WORK ON MULTIPLE PHOTOS</small><h2>Batch background removal</h2><p>Choose AI or colour-based removal, process up to 20 images on your device, and download all cutouts in one ZIP.</p></div><span class="mark">▦</span></div>
 <div class="methods" role="group" aria-label="Batch removal method">
  <button class:active={method==='ai'} aria-pressed={method==='ai'} disabled={running} onclick={()=>setMethod('ai')}><b>AI automatic</b><small>Finds the main subject automatically.</small></button>
  <button class:active={method==='manual'} aria-pressed={method==='manual'} disabled={running} onclick={()=>setMethod('manual')}><b>No-AI colour removal</b><small>Removes a colour you select from the sample image.</small></button>
 </div>
 {#if method==='manual'}
  <div class="sampler-panel">
   <label for="sample-image">Set a separate background colour for each image</label>
   <label for="sample-image">Choose an image to set its background colour</label>
   <select id="sample-image" value={selectedSampleId===null?'':String(selectedSampleId)} onchange={(event)=>chooseSample(Number(event.currentTarget.value))}>
    <option value="" disabled>Select an image</option>
    {#each items as item}
     <option value={item.id}>{item.file.name}{item.sampleColor?' · colour sampled':' · needs sampling'}</option>
    {/each}
   </select>
   {#if sampleUrl}
    <p class="instruction">Click the background in the preview. The colour is saved only for <strong>{sampleFile?.name}</strong>; repeat for each image with a different background.</p>
    <button type="button" class="sample-image" onclick={sampleBackground} aria-label="Click to sample the selected image background"><img bind:this={sampleImage} src={sampleUrl} alt=""/></button>
    {#if selectedItem?.sampleColor}
     {@const selectedColor=selectedItem.sampleColor!}
     <div class="sample-row"><span class="swatch" style="background:rgb({selectedColor.r},{selectedColor.g},{selectedColor.b})"></span><span>Saved RGB for this image: {selectedColor.r}, {selectedColor.g}, {selectedColor.b}</span><button class="quiet" onclick={()=>items=items.map((item)=>item.id===selectedSampleId?{...item,sampleColor:undefined}:item)}>Clear colour</button></div>
    {:else}
     <p class="hint">No colour sampled for this image yet.</p>
    {/if}
   {/if}
   <div class="sample-checklist">
    {#each items as item}
     <div class="sample-check"><span class:sampled={!!item.sampleColor}>{item.sampleColor?'✓':'○'}</span><span>{item.file.name}</span><small>{item.sampleColor?'Ready':'Needs colour'}</small></div>
    {/each}
   </div>
   <label class="tolerance-label" for="batch-tolerance"><span>Tolerance for {sampleFile?.name||'new samples'}</span><b>{selectedItem?.sampleTolerance??tolerance}</b></label>
   <input id="batch-tolerance" type="range" min="10" max="150" step="1" value={selectedItem?.sampleTolerance??tolerance} oninput={(event)=>{const value=Number(event.currentTarget.value);tolerance=value;items=items.map((item)=>item.id===selectedSampleId?{...item,sampleTolerance:value}:item);}}/>
   <small class="hint">Each image has its own sampled RGB colour and tolerance. Similar colours in the subject may also become transparent.</small>
  </div>
 {/if}
 <div class="drop" role="group" ondragover={(event)=>event.preventDefault()} ondrop={drop}>
  <strong>Drop multiple images here</strong><span>PNG · JPG · WEBP · 20 MB each · 100 MB total</span>
  <button onclick={()=>picker?.click()} disabled={running}>Add images</button>
  <input bind:this={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onchange={(event)=>addFiles(event.currentTarget.files??[])}/>
 </div>
 {#if items.length}
  <div class="stats"><span>{items.length} selected · {formatSize(totalBytes)}</span><span>{completed} completed · {failed} failed</span><button class="quiet" onclick={clearQueue} disabled={running}>Clear queue</button></div>
  {#if previewItem}
   <div class="review" aria-label="Review completed cutouts">
    <div class="review-heading"><div><strong>Review your cutouts</strong><small>{previewIndex+1} of {previewItems.length} completed images</small></div><button class="quiet" onclick={closePreview}>Close review</button></div>
    <div class="review-toolbar"><button class:chosen={previewMode==='result'} onclick={()=>previewMode='result'}>Transparent result</button><button class:chosen={previewMode==='original'} onclick={()=>previewMode='original'}>Original image</button></div>
    <div class="review-canvas" class:checker={previewMode==='result'}><img src={previewMode==='result'?previewResultUrl:previewOriginalUrl} alt={previewMode==='result'?'Background-removed result':'Original image'}/></div>
    <div class="review-footer"><button class="quiet" onclick={()=>movePreview(-1)} disabled={previewIndex<=0}>← Previous</button><strong>{previewItem.file.name}</strong><button class="quiet" onclick={()=>movePreview(1)} disabled={previewIndex>=previewItems.length-1}>Next →</button></div>
    <label class="include-toggle"><input type="checkbox" checked={previewItem.includeInExport!==false} onchange={(event)=>toggleExport(previewItem.id,event.currentTarget.checked)}/> Include this image in ZIP export</label>
   </div>
  {/if}
  <div class="list">
   {#each items as item (item.id)}
    <div class="item"><span class="file">▧</span><div class="info"><strong>{item.file.name}</strong><small>{formatSize(item.file.size)}{#if item.message} · {item.message}{:else if item.status==='done'} · Ready to download{/if}</small></div><span class:done={item.status==='done'} class:failed={item.status==='error'} class="status">{item.status}</span>{#if item.status==='done'}<button class="quiet" onclick={()=>openPreview(item.id)}>Preview</button>{/if}{#if !running}<button class="remove" aria-label="Remove {item.file.name}" onclick={()=>removeItem(item.id)}>×</button>{/if}</div>
   {/each}
  </div>
  {#if running}
   <div class="track" role="progressbar" aria-label="Batch progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style="width:{progress}%"></span></div>
   <div class="progress-copy"><span>{completed+failed} of {items.length} processed</span><b>{progress}%</b></div>
   <p class="current">Processing: {currentName}{#if method==='ai'&&modelProgress!==null} · AI model download {modelProgress}%{/if}</p>
  {/if}
  <div class="actions">{#if running}<button class="cancel" onclick={cancelBatch}>Cancel batch</button>{:else}<button class="run" onclick={startBatch} disabled={!items.some((i)=>i.status==='queued')}> {completed||failed?'Process remaining images':'Start batch processing'}</button><button class="download" onclick={downloadZip} disabled={!exportCount}>Download ZIP ({exportCount})</button>{/if}</div>
 {/if}
 {#if error}<p class="error" role="alert">{error}</p>{/if}
 <p class="note">{#if method==='ai'}AI mode downloads model files when needed; your photos remain on this device.{:else}No-AI mode uses the sampled colour and tolerance locally. It does not download an AI model.{/if} Batch processing is sequential to limit device memory use.</p>
</section>
<style>
.batch{margin:30px 0 24px;padding:20px;background:#191b20;border:1px solid #ffffff20;border-radius:18px;color:#f5f4f0}
.heading{display:flex;justify-content:space-between;gap:14px}.heading small{color:#b7f477;font-size:10px;font-weight:800;letter-spacing:1.4px}.heading h2{font-size:22px;margin:8px 0}.heading p{font-size:12px;line-height:1.55;color:#aaa;margin:0;max-width:520px}.mark{color:#b7f477;font-size:25px;border:1px solid #b7f47755;padding:8px 12px;border-radius:12px}
.methods{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:16px 0}.methods button{display:flex;flex-direction:column;gap:6px;text-align:left;background:#ffffff08;color:#eee;border:1px solid #ffffff25;border-radius:10px;padding:12px;cursor:pointer}.methods button.active{border-color:#b7f477;box-shadow:inset 0 0 0 1px #b7f477}.methods button:disabled{opacity:.5}.methods b{font-size:12px}.methods small{font-size:10px;line-height:1.4;color:#aaa}
.sampler-panel{display:flex;flex-direction:column;gap:9px;padding:14px;margin:12px 0;background:#ffffff08;border:1px solid #ffffff18;border-radius:12px}.sampler-panel label{font-size:11px;color:#ddd}.sampler-panel select{width:100%;padding:9px;border-radius:8px;background:#24262d;color:#eee;border:1px solid #ffffff30}.instruction,.hint{font-size:10px;color:#aaa;line-height:1.5;margin:0}.sample-image{display:grid;place-items:center;max-height:220px;overflow:hidden;border:1px dashed #b7f47777;border-radius:8px;background:#111;padding:5px;cursor:crosshair}.sample-image img{max-width:100%;max-height:210px;object-fit:contain}.sample-checklist{display:flex;flex-direction:column;gap:5px;padding:8px;background:#ffffff06;border-radius:8px}.sample-check{display:flex;align-items:center;gap:8px;font-size:10px;color:#bbb}.sample-check span{color:#ffb56b}.sample-check span.sampled{color:#b7f477}.sample-check small{margin-left:auto;color:#999}.sample-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:#ddd}.swatch{width:22px;height:22px;border-radius:5px;border:1px solid #ffffff70}.tolerance-label{display:flex;justify-content:space-between}.tolerance-label b{color:#b7f477}.sampler-panel input{width:100%;accent-color:#b7f477}
.drop{margin:18px 0;padding:20px;border:1px dashed #ffffff40;border-radius:12px;display:flex;align-items:center;flex-direction:column;gap:9px;text-align:center}.drop span,.note{font-size:11px;color:#999;line-height:1.55}.drop button,.run,.download,.cancel{border:0;border-radius:9px;padding:11px 16px;font-weight:750;cursor:pointer}.drop button,.run{background:#b7f477;color:#111}.download{background:#33363e;color:white;border:1px solid #ffffff25}.cancel{background:#512d31;color:#ffdfe1}button:disabled{opacity:.4;cursor:not-allowed}
.stats{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:#aaa;font-size:11px;margin:12px 0}.quiet,.remove{background:none;border:0;color:#b7f477;cursor:pointer;margin-left:auto}.list{display:flex;flex-direction:column;gap:7px;max-height:300px;overflow:auto}.item{display:flex;align-items:center;gap:10px;padding:9px;background:#ffffff08;border-radius:9px;min-width:0}.file{color:#b7f477;font-size:20px}.info{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}.info strong,.info small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.info strong{font-size:11px}.info small{font-size:10px;color:#999}.status{font-size:10px;color:#aaa;text-transform:capitalize}.status.done{color:#b7f477}.status.failed{color:#ff9b9b}.remove{font-size:18px;padding:0 5px}
.review{margin:14px 0;padding:12px;background:#ffffff08;border:1px solid #b7f47755;border-radius:12px}.review-heading,.review-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.review-heading>div{display:flex;flex-direction:column;gap:4px}.review-heading strong{font-size:13px}.review-heading small{font-size:10px;color:#999}.review-toolbar{display:flex;gap:7px;margin:12px 0}.review-toolbar button{padding:7px 10px;border:1px solid #ffffff30;border-radius:7px;background:#ffffff08;color:#ddd;font-size:10px;cursor:pointer}.review-toolbar button.chosen{border-color:#b7f477;color:#b7f477}.review-canvas{height:260px;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#15171b}.review-canvas.checker{background-color:#f3f3f3;background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.review-canvas img{max-width:100%;max-height:250px;object-fit:contain}.review-footer{margin:10px 0;font-size:10px;color:#ddd}.review-footer strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.include-toggle{display:flex;align-items:center;gap:8px;font-size:11px;color:#ddd}.include-toggle input{accent-color:#b7f477}.track{height:8px;border-radius:10px;background:#ffffff20;overflow:hidden;margin-top:18px}.track span{display:block;height:100%;background:#b7f477;transition:width .2s}.progress-copy{display:flex;justify-content:space-between;font-size:10px;color:#aaa;margin-top:7px}.current{font-size:10px;color:#b7f477;overflow-wrap:anywhere}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}.error{color:#ff9b9b;font-size:12px}.note{margin:16px 0 0}
@media(max-width:520px){.batch{padding:15px}.heading h2{font-size:19px}.methods{grid-template-columns:1fr}}
</style>
