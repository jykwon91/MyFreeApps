import { DOCUMENT_KIND_LABELS } from "../constants/documentKindLabels";
import { DOCUMENT_KIND_TONES } from "../constants/documentKindTones";
import type { DocumentKind } from "../types/document/document-kind";
import type { StatusTone } from "../types/status-tone";

function isKnownKind(kind: string): kind is DocumentKind {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_KIND_LABELS, kind);
}

/** A kind's badge words. One added on the backend after this build shows as sent. */
export function documentKindLabel(kind: string): string {
  return isKnownKind(kind) ? DOCUMENT_KIND_LABELS[kind] : kind;
}

/** A kind's badge tone. One added on the backend after this build is neutral. */
export function documentKindTone(kind: string): StatusTone {
  return isKnownKind(kind) ? DOCUMENT_KIND_TONES[kind] : "neutral";
}
