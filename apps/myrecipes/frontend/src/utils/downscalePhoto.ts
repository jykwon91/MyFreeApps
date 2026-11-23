import { PHOTO_IMPORT_JPEG_QUALITY, PHOTO_IMPORT_LONGEST_SIDE } from "@myrecipes/api-client/constants/photoImport";

const JPEG = "image/jpeg";

function jpegName(name: string): string {
  return `${name.replace(/\.[^./\\]+$/, "") || "recipe"}.jpg`;
}

function toJpegBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, JPEG, PHOTO_IMPORT_JPEG_QUALITY));
}

/**
 * Shrinks a photo to the long edge and JPEG quality the backend reads at (and the phone sends), so
 * far less is uploaded and the same recipe is read. It never enlarges, and it drops the metadata
 * (where the photo was taken). A browser that can't decode or re-encode it sends the original: the
 * backend shrinks it either way.
 */
export async function downscalePhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const scale = Math.min(1, PHOTO_IMPORT_LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      // A transparent PNG would turn black as a JPEG.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await toJpegBlob(canvas);
      return blob ? new File([blob], jpegName(file.name), { type: JPEG }) : file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
