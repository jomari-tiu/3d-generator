/** Hand a Blob to the browser as a file download. */
export function download(
  data: Blob | ArrayBuffer | Uint8Array,
  filename: string,
  type: string,
): void {
  // The cast covers Uint8Array<ArrayBufferLike>, which TS will not narrow to
  // BlobPart because its buffer could in principle be a SharedArrayBuffer.
  const blob = data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick: revoking synchronously can cancel the download
  // in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * A string reduced to something safe to name a file.
 *
 * Allow-list, not a block-list. Part names and typed-in text reach this, and
 * those carry curly quotes, accents and anything else a keyboard offers -- a
 * list of forbidden characters only ever catches the ones someone thought of,
 * and the survivors end up in filenames that a zip, a USB stick or another
 * operating system then argues about.
 */
export function safeFilename(s: string, fallback = 'model'): string {
  const cleaned = s
    .trim()
    // Split accents off their letters so the bare letters survive the filter.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : fallback;
}
