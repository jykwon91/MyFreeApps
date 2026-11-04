export function documentUploadForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}
