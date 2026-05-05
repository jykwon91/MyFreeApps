import JSZip from "jszip";
import { showError } from "@/shared/lib/toast-store";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";

/**
 * Fetches each selected photo's presigned URL, bundles them into a zip, and
 * triggers a browser download.
 *
 * Photos without a presigned_url are skipped (storage unavailable / already
 * expired). A warning toast is shown for each skipped photo so the user is
 * not silently given a partial zip.
 */
export async function downloadPhotosAsZip(
  photos: ListingPhoto[],
  listingSlug: string,
): Promise<void> {
  const zip = new JSZip();
  const today = new Date().toISOString().slice(0, 10);
  const zipName = `${listingSlug}-photos-${today}.zip`;

  let skippedCount = 0;

  await Promise.all(
    photos.map(async (photo, index) => {
      if (!photo.presigned_url) {
        skippedCount++;
        return;
      }
      try {
        const response = await fetch(photo.presigned_url);
        if (!response.ok) {
          skippedCount++;
          return;
        }
        const blob = await response.blob();
        const extension = inferExtension(blob.type);
        const filename = `photo-${String(index + 1).padStart(3, "0")}${extension}`;
        zip.file(filename, blob);
      } catch {
        skippedCount++;
      }
    }),
  );

  if (skippedCount > 0) {
    showError(
      skippedCount === 1
        ? "1 photo couldn't be fetched and was skipped."
        : `${skippedCount} photos couldn't be fetched and were skipped.`,
    );
  }

  const content = await zip.generateAsync({ type: "blob" });
  triggerDownload(content, zipName);
}

function inferExtension(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/heic" || mimeType === "image/heif") return ".heic";
  return ".jpg";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
