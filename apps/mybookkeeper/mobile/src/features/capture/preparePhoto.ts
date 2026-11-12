import { reencodePhoto } from "@platform/mobile";
import { PHOTO_JPEG_QUALITY, PHOTO_LONGEST_SIDE } from "../../constants/capture";

/** Re-encodes a photo as a smaller JPEG for upload, at the size and quality MyBookkeeper sends. */
export function preparePhoto(uri: string): Promise<string> {
  return reencodePhoto(uri, { longestSide: PHOTO_LONGEST_SIDE, quality: PHOTO_JPEG_QUALITY });
}
