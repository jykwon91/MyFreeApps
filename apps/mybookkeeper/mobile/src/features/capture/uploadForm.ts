import type { PendingUpload } from "../../types/PendingUpload";

export function uploadForm(upload: PendingUpload): FormData {
  const form = new FormData();
  // React Native's FormData reads a file from its address. Its types only know about strings.
  form.append("file", { uri: upload.uri, name: upload.name, type: upload.mimeType } as unknown as string);
  return form;
}
