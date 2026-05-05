/**
 * Formats a byte count into a human-readable file size string.
 *
 * - Returns "" for null/undefined (unknown size).
 * - Returns "0 B" for exactly 0 bytes.
 * - Uses 1-decimal precision for KB and MB.
 *
 * @example
 * formatFileSize(null)       // ""
 * formatFileSize(0)          // "0 B"
 * formatFileSize(512)        // "512 B"
 * formatFileSize(1536)       // "1.5 KB"
 * formatFileSize(2097152)    // "2.0 MB"
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
