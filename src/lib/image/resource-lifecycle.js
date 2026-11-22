/**
 * Release resources owned by the current image-processing session.
 *
 * URLs are deduplicated so a shared URL is never revoked twice when callers
 * pass both the original and result references.
 *
 * @param {{
 *   worker?: { terminate?: () => void } | null,
 *   objectUrls?: (string | null | undefined)[],
 *   revokeObjectURL?: (url: string) => void
 * }} options
 * @returns {{ terminatedWorker: boolean, revokedUrls: number }}
 */
export function releaseImageResources({
  worker,
  objectUrls = [],
  revokeObjectURL = (url) => URL.revokeObjectURL(url)
} = {}) {
  let terminatedWorker = false;

  if (typeof worker?.terminate === 'function') {
    worker.terminate();
    terminatedWorker = true;
  }

  /** @type {Set<string>} */
  const uniqueUrls = new Set();
  for (const url of objectUrls) {
    if (typeof url === 'string' && url.length > 0) uniqueUrls.add(url);
  }
  let revokedUrls = 0;

  for (const url of uniqueUrls) {
    revokeObjectURL(url);
    revokedUrls += 1;
  }

  return { terminatedWorker, revokedUrls };
}
