import type { FileForUpload } from "../types/FileForUpload";

/** React Native's FormData reads a file from its address. Its types only know about strings. */
export function filePart(file: FileForUpload): string {
  return { uri: file.uri, name: file.name, type: file.mimeType } as unknown as string;
}
