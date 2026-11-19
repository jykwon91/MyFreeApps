import type { Document } from "@mybookkeeper/api-client/types/document/document";

/** What a fake server needs of a document to list it: an id and a status, and any field a filter or order reads. */
type ListedDocument = { id: string; status: string } & Partial<Omit<Document, "id" | "status">>;

const BEING_READ = ["processing", "extracting"];
const NOT_IN_LIBRARY = [...BEING_READ, "duplicate", "deleted"];
const NEEDS_REVIEW = ["failed", "duplicate"];

function text(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function matching<D extends ListedDocument>(documents: readonly D[], query: URLSearchParams): D[] {
  const search = text(query.get("search"));
  const statuses = query.getAll("statuses");
  const types = query.getAll("document_types");
  const sources = query.getAll("sources");
  return documents.filter(
    (document) =>
      text(document.file_name).includes(search) &&
      (!statuses.length || statuses.includes(document.status)) &&
      (!types.length || types.includes(document.document_type ?? "")) &&
      (!sources.length || sources.includes(document.source ?? "")) &&
      (query.get("exclude_processing") !== "true" || !NOT_IN_LIBRARY.includes(document.status)) &&
      (query.get("needs_review") !== "true" || NEEDS_REVIEW.includes(document.status)),
  );
}

function ordered<D extends ListedDocument>(documents: readonly D[], query: URLSearchParams): D[] {
  const field = (query.get("sort_by") ?? "created_at") as keyof ListedDocument;
  const direction = query.get("sort_dir") === "asc" ? 1 : -1;
  const newestFirst = (a: D, b: D) => text(b.created_at).localeCompare(text(a.created_at));
  return [...documents].sort((a, b) => direction * text(a[field]).localeCompare(text(b[field])) || newestFirst(a, b));
}

/**
 * Answers the documents list's reads the way the backend does: GET /documents/page (narrowed, ordered and a
 * page from `offset`), GET /documents/selection (every match's id and status) and GET /documents/summary.
 * Undefined for any other request, for the fake server to answer itself.
 */
export function answerDocumentList<D extends ListedDocument>(requestUrl: string | undefined, documents: readonly D[]): unknown {
  const url = new URL(requestUrl ?? "", "http://test");
  const query = url.searchParams;
  if (url.pathname === "/documents/page") {
    const rows = ordered(matching(documents, query), query);
    const offset = Number(query.get("offset") ?? 0);
    const items = rows.slice(offset, offset + Number(query.get("limit") ?? rows.length));
    return { items, total: rows.length, has_more: offset + items.length < rows.length };
  }
  if (url.pathname === "/documents/selection") return matching(documents, query).map(({ id, status }) => ({ id, status }));
  if (url.pathname === "/documents/summary") {
    const counting = (statuses: string[]) => documents.filter((document) => statuses.includes(document.status)).length;
    return { total: documents.length, in_progress: counting(BEING_READ), needs_review: counting(NEEDS_REVIEW) };
  }
  return undefined;
}
