import { filePart } from "../../lib/filePart";
import type { PendingUpload } from "../../types/PendingUpload";

export function uploadForm(upload: PendingUpload): FormData {
  const form = new FormData();
  form.append("file", filePart(upload));
  return form;
}
