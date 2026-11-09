/** Multipart body for the section-image upload: every file goes under the `files` field. */
export function buildSectionImageForm(files: File[]): FormData {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return form;
}
