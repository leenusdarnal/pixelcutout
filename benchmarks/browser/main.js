const fixtureInput = document.querySelector('#fixture-folder');
const fixtureFilesInput = document.querySelector('#fixture-files');
const outputButton = document.querySelector('#choose-output');
const runButton = document.querySelector('#run-benchmark');
const fixtureStatus = document.querySelector('#fixture-status');
const outputStatus = document.querySelector('#output-status');
const progressMessage = document.querySelector('#progress-message');
const progressBar = document.querySelector('#progress-bar');
const progressDetail = document.querySelector('#progress-detail');
const progressPercent = document.querySelector('#progress-percent');
const runState = document.querySelector('#run-state');
const resultsRoot = document.querySelector('#results');
const downloadsRoot = document.querySelector('#downloads');
const fixtureReviewSection = document.querySelector('#fixture-review-section');
const fixtureReviewGrid = document.querySelector('#fixture-review-grid');
const reviewCount = document.querySelector('#review-count');
const reviewDownloadButton = document.querySelector('#download-label-review');

const CHALLENGE_LABELS = [
  ['B01', 'Person · straight hair'],
  ['B02', 'Person · curly hair / flyaways'],
  ['B03', 'Person · clothing gaps'],
  ['B04', 'Animal · long fur'],
  ['B05', 'Animal · dark-on-dark'],
  ['B06', 'Animal · pale fur'],
  ['B07', 'Product · cast shadow'],
  ['B08', 'Object · low contrast'],
  ['B09', 'Glass · transparent / reflective'],
  ['B10', 'Object · thin parts / openings'],
  ['B11', 'Plant · fine leaves / stems'],
  ['B12', 'Structure · mesh / spokes'],
  ['B13', 'Material · lace / open weave'],
  ['B14', 'Natural detail · feather / branches'],
  ['B15', 'Difficult · similar background'],
  ['B16', 'Occlusion · clutter / overlap']
];

let fixtureSet = null;
let outputDirectory = null;
let running = false;
let completedCases = 0;
let totalCases = 0;
const fallbackDownloads = [];
const fixturePreviewUrls = [];

function setStatus(element, message, tone = '') {
  element.textContent = message;
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function updateProgress(message, done = completedCases, total = totalCases) {
  completedCases = done;
  totalCases = total;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  progressMessage.textContent = message;
  progressDetail.textContent = `${done} / ${total} cases`;
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
}

function setRunState(state, label) {
  runState.dataset.state = state;
  runState.textContent = label;
}

function safeCaseId(value) {
  return typeof value === 'string' && /^B\d{2}$/.test(value);
}

function clearFixtureReview() {
  for (const url of fixturePreviewUrls.splice(0)) URL.revokeObjectURL(url);
  fixtureReviewGrid.replaceChildren();
  fixtureReviewSection.hidden = true;
  reviewDownloadButton.disabled = true;
  reviewCount.textContent = '0 / 16 mapped';
  delete reviewCount.dataset.tone;
}

function refreshReviewSummary(cases) {
  const assigned = cases.filter((item) => item.reviewChallenge && item.reviewChallenge !== 'none');
  const challengeCounts = new Map();
  for (const item of assigned) {
    challengeCounts.set(item.reviewChallenge, (challengeCounts.get(item.reviewChallenge) || 0) + 1);
  }
  const duplicates = Array.from(challengeCounts.values()).filter((count) => count > 1).length;
  reviewCount.textContent = `${assigned.length} / ${cases.length} mapped${duplicates ? ` · ${duplicates} duplicate labels` : ''}`;
  if (assigned.length === cases.length && duplicates === 0) reviewCount.dataset.tone = 'success';
  else delete reviewCount.dataset.tone;
}

function buildLabelReview() {
  if (!fixtureSet) return null;
  const labels = new Map(CHALLENGE_LABELS);
  return {
    schemaVersion: 1,
    dataset: fixtureSet.manifest.dataset || 'AIM-500',
    datasetMainRevision: fixtureSet.manifest.dataset_revision || null,
    datasetParquetRevision: fixtureSet.manifest.dataset_parquet_revision || null,
    createdAt: new Date().toISOString(),
    cases: fixtureSet.cases.map((item) => ({
      caseId: item.id,
      filename: item.filename,
      category: item.category,
      width: item.width,
      height: item.height,
      imageSha256: item.imageSha256,
      annotationFilename: item.annotationFilename,
      annotationSha256: item.annotationSha256,
      challengeId: item.reviewChallenge && item.reviewChallenge !== 'none' ? item.reviewChallenge : null,
      challengeLabel: labels.get(item.reviewChallenge) || null,
      reviewStatus: item.reviewChallenge === 'none'
        ? 'no_direct_match'
        : item.reviewChallenge
          ? 'mapped'
          : 'unreviewed'
    }))
  };
}

function appendReviewImage(parent, file, caption, alt) {
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  const url = URL.createObjectURL(file);
  fixturePreviewUrls.push(url);
  image.src = url;
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  const label = document.createElement('figcaption');
  label.textContent = caption;
  figure.append(image, label);
  parent.append(figure);
}

function renderFixtureReview(cases) {
  clearFixtureReview();
  const fragment = document.createDocumentFragment();

  for (const item of cases) {
    const card = document.createElement('article');
    card.className = 'review-card';

    const heading = document.createElement('div');
    heading.className = 'review-card-heading';
    const caseId = document.createElement('strong');
    caseId.textContent = item.id;
    const category = document.createElement('span');
    category.textContent = item.category;
    category.title = item.category;
    heading.append(caseId, category);

    const images = document.createElement('div');
    images.className = 'review-images';
    appendReviewImage(images, item.image, 'Source photo', `${item.id} source photo`);
    appendReviewImage(images, item.mask, 'Ground-truth matte', `${item.id} ground-truth alpha matte`);

    const filename = document.createElement('span');
    filename.className = 'review-filename';
    filename.textContent = `${item.width} × ${item.height} · ${item.filename}`;
    filename.title = item.filename;

    const label = document.createElement('label');
    label.className = 'review-label';
    label.textContent = 'Best matching challenge';
    const select = document.createElement('select');
    select.setAttribute('aria-label', `${item.id} best matching challenge`);

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Choose after review';
    select.append(emptyOption);
    for (const [id, description] of CHALLENGE_LABELS) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${id} · ${description}`;
      select.append(option);
    }
    const noMatchOption = document.createElement('option');
    noMatchOption.value = 'none';
    noMatchOption.textContent = 'No direct match';
    select.append(noMatchOption);
    select.value = item.reviewChallenge || '';
    select.addEventListener('change', () => {
      item.reviewChallenge = select.value || null;
      refreshReviewSummary(cases);
    });
    label.append(select);

    card.append(heading, images, filename, label);
    fragment.append(card);
  }

  fixtureReviewGrid.replaceChildren(fragment);
  fixtureReviewSection.hidden = false;
  reviewDownloadButton.disabled = false;
  refreshReviewSummary(cases);
}

async function readFixtureFolder(fileList) {
  const files = Array.from(fileList);
  const manifestFile = files.find((file) => file.name === 'aim500-candidates.json');
  if (!manifestFile) {
    throw new Error('Could not find aim500-candidates.json. Choose the AIM-500 output folder, not its images subfolder.');
  }

  const manifest = JSON.parse(await manifestFile.text());
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 16) {
    throw new Error('The AIM-500 report must contain exactly 16 candidate cases.');
  }

  const filesByName = new Map();
  for (const file of files) {
    if (filesByName.has(file.name)) {
      throw new Error(`Duplicate filename selected: ${file.name}. Select one complete fixture folder.`);
    }
    filesByName.set(file.name, file);
  }

  const cases = manifest.cases.map((entry) => {
    const id = entry.case_id || entry.id;
    if (!safeCaseId(id)) throw new Error('Fixture report contains an unexpected case ID.');
    if (entry.annotation_type !== 'alpha') {
      throw new Error(`${id} is not labelled as a soft-alpha case.`);
    }
    const image = filesByName.get(entry.filename);
    const mask = filesByName.get(entry.annotation_filename);
    if (!image || !mask) {
      throw new Error(`${id}: missing image or alpha matte. Select the complete folder or all 33 fixture files.`);
    }
    if (!Number.isSafeInteger(entry.width) || !Number.isSafeInteger(entry.height)) {
      throw new Error(`${id}: missing image dimensions in the fixture report.`);
    }
    return {
      id,
      category: String(entry.category || 'unknown'),
      filename: entry.filename,
      annotationFilename: entry.annotation_filename,
      image,
      mask,
      imageSha256: entry.image_sha256 || null,
      annotationSha256: entry.annotation_sha256 || null,
      width: entry.width,
      height: entry.height,
      reviewChallenge: null
    };
  });

  return { manifest, cases };
}

async function handleFixtureSelection(fileList) {
  if (running) return;
  fixtureSet = null;
  clearFixtureReview();
  runButton.disabled = true;
  if (!fileList?.length) {
    setStatus(fixtureStatus, 'No fixture files selected.');
    return;
  }

  setStatus(fixtureStatus, 'Checking the manifest and all local image/matte pairs…');
  try {
    fixtureSet = await readFixtureFolder(fileList);
    renderFixtureReview(fixtureSet.cases);
    setStatus(
      fixtureStatus,
      `Ready: ${fixtureSet.cases.length} image/matte pairs · ${fixtureSet.manifest.dataset || 'AIM-500'} · images remain local.`,
      'success'
    );
    runButton.disabled = false;
    updateProgress('Fixture set is ready. Choose the models and backend, then start the run.', 0, 0);
  } catch (error) {
    fixtureSet = null;
    clearFixtureReview();
    setStatus(fixtureStatus, error instanceof Error ? error.message : 'Could not read the fixture files.', 'error');
  }
}

fixtureInput.addEventListener('change', () => handleFixtureSelection(fixtureInput.files));
fixtureFilesInput.addEventListener('change', () => handleFixtureSelection(fixtureFilesInput.files));

outputButton.addEventListener('click', async () => {
  if (running) return;
  if (typeof window.showDirectoryPicker !== 'function') {
    setStatus(
      outputStatus,
      'This browser does not support folder writing. Prediction PNGs will be offered as individual downloads.',
      'error'
    );
    return;
  }
  try {
    outputDirectory = await window.showDirectoryPicker({ mode: 'readwrite' });
    setStatus(outputStatus, `Output folder selected: ${outputDirectory.name}`, 'success');
  } catch (error) {
    if (error?.name !== 'AbortError') {
      setStatus(outputStatus, 'Could not access the selected output folder.', 'error');
    }
  }
});

function selectedDevice() {
  return document.querySelector('input[name="device"]:checked')?.value || 'webgpu';
}

function selectedModels() {
  return Array.from(document.querySelectorAll('input[name="model"]:checked')).map((input) => input.value);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString()} ms` : '—';
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return 'Not reported';
  const units = ['B', 'KB', 'MB', 'GB'];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

async function ensureDirectory(parent, name) {
  return parent.getDirectoryHandle(name, { create: true });
}

async function writeLocalFile(directory, pathParts, blob) {
  let folder = directory;
  for (const name of pathParts.slice(0, -1)) {
    folder = await ensureDirectory(folder, name);
  }
  const handle = await folder.getFileHandle(pathParts[pathParts.length - 1], { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function offerDownload(name, blob) {
  const url = URL.createObjectURL(blob);
  fallbackDownloads.push(url);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.textContent = name;
  downloadsRoot.append(link);
}

async function persistFile(modelFolder, subfolder, filename, blob) {
  if (outputDirectory) {
    await writeLocalFile(outputDirectory, [modelFolder, subfolder, filename], blob);
  } else {
    offerDownload(`${modelFolder}-${filename}`, blob);
  }
}

reviewDownloadButton.addEventListener('click', async () => {
  const review = buildLabelReview();
  if (!review) return;
  const blob = new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' });
  try {
    if (outputDirectory) {
      await writeLocalFile(outputDirectory, ['aim500-label-review.json'], blob);
      setStatus(outputStatus, 'Label review JSON saved to the selected local output folder.', 'success');
    } else {
      offerDownload('aim500-label-review.json', blob);
      setStatus(outputStatus, 'Label review JSON is ready to download below.', 'success');
    }
  } catch (error) {
    setStatus(outputStatus, error instanceof Error ? error.message : 'Could not save the label review JSON.', 'error');
  }
});

function buildResultCard(result) {
  const card = document.createElement('article');
  card.className = 'result-card';

  const heading = document.createElement('div');
  heading.className = 'result-title';
  const title = document.createElement('h3');
  title.textContent = result.label;
  const subtitle = document.createElement('span');
  subtitle.textContent = `${result.device.toUpperCase()} · ${result.runs.length} cases`;
  heading.append(title, subtitle);

  const metrics = document.createElement('div');
  metrics.className = 'metrics-grid';
  const fields = [
    ['Model load', formatMs(result.modelLoadMs)],
    ['Warm-up', formatMs(result.warmupMs)],
    ['Median inference', formatMs(result.medianInferenceMs)],
    ['Reported asset bytes', formatBytes(result.reportedAssetBytes)]
  ];
  for (const [label, value] of fields) {
    const item = document.createElement('div');
    item.className = 'metric';
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = label;
    item.append(strong, small);
    metrics.append(item);
  }

  const table = document.createElement('table');
  table.className = 'case-table';
  const head = document.createElement('thead');
  head.innerHTML = '<tr><th>Case</th><th>Preprocess</th><th>Inference</th><th>Total</th></tr>';
  const body = document.createElement('tbody');
  for (const run of result.runs) {
    const row = document.createElement('tr');
    for (const value of [run.caseId, formatMs(run.preprocessMs), formatMs(run.inferenceMs), formatMs(run.totalMs)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  card.append(heading, metrics, table);
  resultsRoot.append(card);
}

function waitForWorkerMessage(worker, expectedType, onProgress) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
    const handleMessage = (event) => {
      const message = event.data;
      if (message.type === 'download-progress' || message.type === 'status') {
        onProgress?.(message);
        return;
      }
      if (message.type === 'failure') {
        cleanup();
        reject(new Error(message.message || 'Model worker failed.'));
        return;
      }
      if (message.type === expectedType) {
        cleanup();
        resolve(message);
      }
    };
    const handleError = (event) => {
      cleanup();
      reject(new Error(event.message || 'Model worker crashed.'));
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
  });
}

async function runOneModel(candidate, device, cases, onCaseProgress) {
  const worker = new Worker(new URL('./runner.worker.js', import.meta.url), { type: 'module' });
  const startedAt = performance.now();
  const modelFolder = `${candidate}-${device}`;
  let loadMessage;

  try {
    worker.postMessage({ type: 'load', candidate, device });
    loadMessage = await waitForWorkerMessage(worker, 'ready', (message) => {
      if (message.type === 'download-progress') {
        const loaded = formatBytes(message.loadedBytes);
        const total = formatBytes(message.totalBytes);
        updateProgress(`Loading ${candidate}: ${loaded} of ${total} reported model asset bytes…`);
      } else if (message.type === 'status') {
        updateProgress(`Loading ${candidate}: ${message.message || 'Preparing model'}…`);
      }
    });

    const warmup = await new Promise((resolve, reject) => {
      const onMessage = (event) => {
        if (event.data.type === 'warmup-result') {
          worker.removeEventListener('message', onMessage);
          resolve(event.data);
        } else if (event.data.type === 'failure') {
          worker.removeEventListener('message', onMessage);
          reject(new Error(event.data.message || 'Warm-up failed.'));
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'warmup', image: cases[0].image });
    });

    const runs = [];
    for (let index = 0; index < cases.length; index += 1) {
      const item = cases[index];
      onCaseProgress(item, index);
      const measured = await new Promise((resolve, reject) => {
        const onMessage = (event) => {
          const message = event.data;
          if (message.type === 'case-result' && message.caseId === item.id) {
            worker.removeEventListener('message', onMessage);
            resolve(message);
          } else if (message.type === 'failure') {
            worker.removeEventListener('message', onMessage);
            reject(new Error(message.message || `${item.id} inference failed.`));
          }
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({ type: 'run-case', caseId: item.id, image: item.image });
      });

      const run = {
        caseId: item.id,
        category: item.category,
        width: measured.width,
        height: measured.height,
        imageSha256: item.imageSha256,
        annotationSha256: item.annotationSha256,
        preprocessMs: measured.preprocessMs,
        inferenceMs: measured.inferenceMs,
        postprocessMs: measured.postprocessMs,
        totalMs: measured.totalMs
      };
      runs.push(run);
      await persistFile(modelFolder, 'predictions', `${item.id}.png`, measured.alphaPng);
      onCaseProgress(item, index + 1, candidate);
    }

    const inferenceTimes = runs.map((run) => run.inferenceMs);
    const result = {
      schemaVersion: 1,
      tool: 'PixelCutout local browser model benchmark',
      createdAt: new Date().toISOString(),
      candidate,
      label: candidate === 'modnet' ? 'MODNet' : 'BiRefNet Lite 512',
      modelId: loadMessage.modelId,
      modelRevision: loadMessage.modelRevision,
      modelRevisionPinned: false,
      device,
      dtype: loadMessage.dtype,
      runtime: '@huggingface/transformers 4.3.2',
      browser: navigator.userAgent,
      platform: navigator.platform || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemoryGb: navigator.deviceMemory || null,
      modelLoadMs: loadMessage.modelLoadMs,
      warmupMs: warmup.totalMs,
      medianInferenceMs: median(inferenceTimes),
      averageInferenceMs: inferenceTimes.reduce((sum, value) => sum + value, 0) / inferenceTimes.length,
      reportedAssetBytes: loadMessage.reportedAssetBytes,
      actualNetworkTransferBytes: null,
      memoryNote: 'Peak GPU/WASM memory is not exposed consistently by browsers; profile separately on the target device.',
      fixtureDataset: fixtureSet.manifest.dataset || 'AIM-500',
      fixtureMainRevision: fixtureSet.manifest.dataset_revision || null,
      fixtureParquetRevision: fixtureSet.manifest.dataset_parquet_revision || null,
      fixtureCount: cases.length,
      labelReview: buildLabelReview(),
      runs
    };

    const jsonBlob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    await persistFile(modelFolder, 'metadata', 'benchmark.json', jsonBlob);
    return result;
  } finally {
    worker.terminate();
    if (!running) return;
    const elapsed = Math.round(performance.now() - startedAt);
    console.info(`${candidate} benchmark worker closed after ${elapsed} ms`);
  }
}

runButton.addEventListener('click', async () => {
  if (!fixtureSet || running) return;
  const models = selectedModels();
  if (!models.length) {
    updateProgress('Select at least one model before starting.');
    return;
  }
  const device = selectedDevice();
  if (device === 'webgpu') {
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('This browser/device did not provide a WebGPU adapter. Choose WASM instead.');
    } catch (error) {
      updateProgress(error instanceof Error ? error.message : 'WebGPU is unavailable. Choose WASM instead.');
      setRunState('error', 'Unsupported');
      return;
    }
  }

  running = true;
  runButton.disabled = true;
  outputButton.disabled = true;
  fixtureInput.disabled = true;
  fixtureFilesInput.disabled = true;
  resultsRoot.replaceChildren();
  downloadsRoot.replaceChildren();
  for (const url of fallbackDownloads.splice(0)) URL.revokeObjectURL(url);
  const results = [];
  completedCases = 0;
  totalCases = models.length * fixtureSet.cases.length;
  updateProgress('Starting local benchmark…', 0, totalCases);
  setRunState('running', 'Running');

  try {
    for (const candidate of models) {
      updateProgress(`Loading ${candidate === 'modnet' ? 'MODNet' : 'BiRefNet Lite'} for ${device.toUpperCase()}…`);
      const result = await runOneModel(candidate, device, fixtureSet.cases, (item, count, completedCandidate) => {
        const completed = results.reduce((sum, entry) => sum + entry.runs.length, 0) + count;
        const label = candidate === 'modnet' ? 'MODNet' : 'BiRefNet Lite';
        updateProgress(
          completedCandidate
            ? `${label}: completed ${item.id}`
            : `${label}: processing ${item.id}`,
          completed,
          totalCases
        );
      });
      results.push(result);
      buildResultCard(result);
    }

    const summary = {
      schemaVersion: 1,
      tool: 'PixelCutout local browser model benchmark',
      createdAt: new Date().toISOString(),
      fixtureDataset: fixtureSet.manifest.dataset || 'AIM-500',
      device,
      imagePixelsUploaded: false,
      labelReview: buildLabelReview(),
      models: results
    };
    const summaryBlob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const labelReviewBlob = new Blob([JSON.stringify(buildLabelReview(), null, 2)], { type: 'application/json' });
    if (outputDirectory) {
      await writeLocalFile(outputDirectory, ['benchmark-summary.json'], summaryBlob);
      await writeLocalFile(outputDirectory, ['aim500-label-review.json'], labelReviewBlob);
      updateProgress('Complete. Predictions, timings and case-label review were saved to the selected folder.', totalCases, totalCases);
    } else {
      offerDownload('pixelcutout-benchmark-summary.json', summaryBlob);
      offerDownload('aim500-label-review.json', labelReviewBlob);
      updateProgress('Complete. Download the prediction PNGs, benchmark summary and label review below.', totalCases, totalCases);
    }
    setRunState('done', 'Complete');
  } catch (error) {
    updateProgress(error instanceof Error ? error.message : 'Benchmark failed. Check the browser console for details.');
    setRunState('error', 'Failed');
  } finally {
    running = false;
    runButton.disabled = !fixtureSet;
    outputButton.disabled = false;
    fixtureInput.disabled = false;
    fixtureFilesInput.disabled = false;
  }
});

window.addEventListener('beforeunload', () => {
  for (const url of fixturePreviewUrls.splice(0)) URL.revokeObjectURL(url);
  for (const url of fallbackDownloads.splice(0)) URL.revokeObjectURL(url);
});

if (!('showDirectoryPicker' in window)) {
  outputButton.textContent = 'Folder saving unsupported';
  outputButton.title = 'Prediction PNGs and review JSON will be offered as individual downloads.';
}
