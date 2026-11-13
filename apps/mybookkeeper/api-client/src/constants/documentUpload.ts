import { mimeTypeFor } from "@platform/core/utils/mimeTypeFor";
import { MB, MIB } from "./byteUnits";
import { REQUEST_BODY_MAX_BYTES, REQUEST_OVERHEAD_BYTES } from "./requestBodyLimit";

/**
 * What the Documents upload takes, by extension: the server decides a file's kind from its name
 * (``detect_file_type`` in ``platform_shared.extraction.files``) and reads these. A zip is opened on
 * the server and each supported file inside becomes its own document.
 */
export const DOCUMENT_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".zip",
] as const;

/** For a file input's ``accept``. */
export const DOCUMENT_UPLOAD_ACCEPT = DOCUMENT_UPLOAD_EXTENSIONS.join(",");

/** The same files by type, for a picker that filters by type. */
export const DOCUMENT_UPLOAD_MIME_TYPES: readonly string[] = [...new Set(DOCUMENT_UPLOAD_EXTENSIONS.map(mimeTypeFor))];

/** ``settings.max_upload_size_bytes`` (``core/config.py``). */
export const DOCUMENT_UPLOAD_SERVER_MAX_BYTES = 100 * MIB;

/** The largest file that gets through: the proxy's request ceiling is lower than the server's own limit. */
export const DOCUMENT_UPLOAD_MAX_BYTES = Math.min(DOCUMENT_UPLOAD_SERVER_MAX_BYTES, REQUEST_BODY_MAX_BYTES - REQUEST_OVERHEAD_BYTES);

export const DOCUMENT_UPLOAD_MAX_LABEL = `${DOCUMENT_UPLOAD_MAX_BYTES / MB} MB`;

export const DOCUMENT_UPLOAD_KINDS_LABEL = "PDFs, photos (JPG, PNG, WEBP), Word, Excel, CSV and zip files";
