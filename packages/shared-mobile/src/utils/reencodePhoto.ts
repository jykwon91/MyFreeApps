import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { PhotoEncoding } from "../types/PhotoEncoding";

/**
 * Re-encodes a photo as a smaller JPEG and returns where it was saved. That also converts HEIC,
 * which a server may not read and is larger to upload, and drops the metadata, which can hold
 * where the photo was taken. The size limit is a load option, so a large photo is downsampled
 * while it's decoded instead of being held in memory at full size; a smaller one keeps its size.
 */
export async function reencodePhoto(uri: string, encoding: PhotoEncoding): Promise<string> {
  const { longestSide, quality } = encoding;
  const context = ImageManipulator.manipulate(uri, { maxWidth: longestSide, maxHeight: longestSide });
  try {
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
      return saved.uri;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
