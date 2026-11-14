const TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  zip: "application/zip",
  md: "text/markdown",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** For when the file picker doesn't say. The server checks an unknown type by name and refuses it if it must. */
export function mimeTypeFor(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES_BY_EXTENSION[extension] ?? "application/octet-stream";
}
