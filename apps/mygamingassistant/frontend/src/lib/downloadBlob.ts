/** Hands the browser a file to save, named `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Hands the browser zip bytes to save, named `filename`. */
export function downloadZip(bytes: Uint8Array, filename: string): void {
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/zip" }), filename);
}
