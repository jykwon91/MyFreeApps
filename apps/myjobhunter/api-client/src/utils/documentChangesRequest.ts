import type { Document } from "../types/document/document";
import type { DocumentKind } from "../types/document/document-kind";
import type { DocumentUpdateRequest } from "../types/document/document-update-request";

/**
 * Only what changed, for PATCH /documents/{id}. A file's content can't be
 * replaced, so its body is never sent. Empty when nothing changed.
 */
export function documentChangesRequest(
  current: Pick<Document, "title" | "kind" | "body" | "has_file">,
  next: { title: string; kind: DocumentKind; body: string },
): DocumentUpdateRequest {
  const patch: DocumentUpdateRequest = {};
  if (next.title !== current.title) patch.title = next.title;
  if (next.kind !== current.kind) patch.kind = next.kind;
  if (!current.has_file && next.body !== (current.body ?? "")) patch.body = next.body;
  return patch;
}
