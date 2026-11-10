import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { PHOTO_JPEG_QUALITY, PHOTO_LONGEST_SIDE } from "../../constants/capture";

/**
 * Re-encodes a photo as a smaller JPEG. That also converts HEIC (the server can decode HEIC,
 * but the JPEG is much smaller to upload) and drops the metadata, which can hold where the
 * photo was taken.
 */
export async function preparePhoto(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  try {
    if (Math.max(width, height) > PHOTO_LONGEST_SIDE) {
      context.resize(width >= height ? { width: PHOTO_LONGEST_SIDE } : { height: PHOTO_LONGEST_SIDE });
    }
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY });
      return saved.uri;
    } finally {
      // Both hold native memory until they are let go.
      image.release();
    }
  } finally {
    context.release();
  }
}
