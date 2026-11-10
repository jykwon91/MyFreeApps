import type { PendingUpload } from "../../types/PendingUpload";
import { filePart } from "@platform/mobile";

export function uploadForm(upload: PendingUpload): FormData {
  const form = new FormData();
  form.append("file", filePart(upload));
  return form;
}
