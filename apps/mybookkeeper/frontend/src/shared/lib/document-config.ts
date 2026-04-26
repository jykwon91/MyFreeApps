import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/shared/lib/constants";

export const TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({
  value: t,
  label: DOCUMENT_TYPE_LABELS[t] ?? t,
}));

export const STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "duplicate", label: "Duplicate" },
  { value: "processing", label: "Processing" },
  { value: "extracting", label: "Extracting" },
];

export const SOURCE_OPTIONS = [
  { value: "upload", label: "Upload" },
  { value: "email", label: "Email" },
];
