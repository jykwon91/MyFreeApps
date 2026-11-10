import type { DocumentKind } from "../types/document/document-kind";
import type { DocumentKindOption } from "../types/document/document-kind-option";
import { DOCUMENT_KIND_LABELS } from "./documentKindLabels";

/** Every document kind with its label, for a picker. */
export const DOCUMENT_KIND_OPTIONS: readonly DocumentKindOption[] = (
  Object.entries(DOCUMENT_KIND_LABELS) as [DocumentKind, string][]
).map(([value, label]) => ({ value, label }));
