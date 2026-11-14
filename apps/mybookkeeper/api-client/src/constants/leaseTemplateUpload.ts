import { MIB } from "./byteUnits";
import { REQUEST_BODY_MAX_BYTES, REQUEST_OVERHEAD_BYTES } from "./requestBodyLimit";

/** Mirrors ``ALLOWED_TEMPLATE_MIME_TYPES`` in ``lease_template_service``: the server refuses anything else. */
export const LEASE_TEMPLATE_MIME_TYPES = [
  "text/markdown",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** For a file input's ``accept``: the extensions too, since a browser often sends a .docx without a type. */
export const LEASE_TEMPLATE_ACCEPT = [".md", ".txt", ".docx", ...LEASE_TEMPLATE_MIME_TYPES].join(",");

export const LEASE_TEMPLATE_EXTENSIONS = [".md", ".txt", ".docx"] as const;

export const LEASE_TEMPLATE_EXTENSIONS_LABEL = LEASE_TEMPLATE_EXTENSIONS.join(", ");

/** ``settings.max_blackout_attachment_size_bytes`` (``core/config.py``), which ``lease_template_service`` applies to each file. */
export const LEASE_TEMPLATE_FILE_MAX_BYTES = 25 * MIB;

/** What the files together may come to for the whole request to get through, with room for the name and description. */
export const LEASE_TEMPLATE_FILES_TOTAL_MAX_BYTES = REQUEST_BODY_MAX_BYTES - REQUEST_OVERHEAD_BYTES;

export const LEASE_TEMPLATE_FILE_MAX_LABEL = "25 MB";
export const LEASE_TEMPLATE_FILES_TOTAL_MAX_LABEL = "29 MB";

/** Column size of ``lease_templates.name``. */
export const LEASE_TEMPLATE_NAME_MAX_LENGTH = 200;

export const LEASE_TEMPLATE_UPLOAD_PROBLEMS = {
  name_required: "Please name this template.",
  name_too_long: "That name is too long.",
  files_required: "Please add at least one file.",
  file_type_unsupported: `I can only use ${LEASE_TEMPLATE_EXTENSIONS_LABEL} files.`,
  file_too_big: `A file is over ${LEASE_TEMPLATE_FILE_MAX_LABEL}.`,
  files_too_big_together: `Those files add up to more than ${LEASE_TEMPLATE_FILES_TOTAL_MAX_LABEL}. Upload fewer at a time.`,
} as const;

/** A bundle of Word files on a slow connection, and the AI read of it that follows. */
export const LEASE_TEMPLATE_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
export const LEASE_TEMPLATE_SUGGEST_TIMEOUT_MS = 2 * 60 * 1000;
