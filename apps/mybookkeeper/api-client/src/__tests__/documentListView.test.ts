import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT_VIEW } from "../constants/documentListView";
import type { Document } from "../types/document/document";
import type { DocumentListView } from "../types/document/DocumentListView";
import { activeDocumentFilterCount, isDefaultDocumentView, matchesChoice, viewDocuments } from "../utils/documentListView";

function doc(overrides: Partial<Document>): Document {
  return { id: "x", file_name: "x.pdf", document_type: "receipt", source: "upload", status: "completed", created_at: "2026-11-01T00:00:00Z", ...overrides } as Document;
}

const RECEIPT = doc({ id: "r", file_name: "Receipt.pdf", created_at: "2026-11-01T00:00:00Z" });
const INVOICE = doc({ id: "i", file_name: "invoice.pdf", document_type: "invoice", source: "email", created_at: "2026-11-02T00:00:00Z" });
const FAILED = doc({ id: "f", file_name: null, document_type: null, status: "failed", created_at: "2026-11-03T00:00:00Z" });
const ALL = [RECEIPT, INVOICE, FAILED];
const ids = (documents: Document[]) => documents.map((d) => d.id);
const view = (change: Partial<DocumentListView>): DocumentListView => ({ ...DEFAULT_DOCUMENT_VIEW, ...change });

describe("matchesChoice", () => {
  it("matches anything when nothing is chosen, as unticking the last box in the website's column filter clears the filter", () => {
    expect(matchesChoice("a", [])).toBe(true);
    expect(matchesChoice(null, [])).toBe(true);
  });

  it("matches only a chosen value, and a missing value as an empty string", () => {
    expect(matchesChoice("a", ["a", "b"])).toBe(true);
    expect(matchesChoice("c", ["a", "b"])).toBe(false);
    expect(matchesChoice(null, ["a"])).toBe(false);
    expect(matchesChoice(null, [""])).toBe(true);
  });
});

describe("viewDocuments", () => {
  it("opens newest first", () => {
    expect(ids(viewDocuments(ALL, DEFAULT_DOCUMENT_VIEW))).toEqual(["f", "i", "r"]);
  });

  it("searches the file name without regard to case, and a missing name matches nothing", () => {
    expect(ids(viewDocuments(ALL, view({ search: "  RECEIPT " })))).toEqual(["r"]);
    expect(ids(viewDocuments(ALL, view({ search: "pdf" })))).toEqual(["i", "r"]);
  });

  it("narrows by status, type and source together", () => {
    expect(ids(viewDocuments(ALL, view({ statuses: ["failed"] })))).toEqual(["f"]);
    expect(ids(viewDocuments(ALL, view({ types: ["invoice", "receipt"] })))).toEqual(["i", "r"]);
    expect(ids(viewDocuments(ALL, view({ sources: ["email"] })))).toEqual(["i"]);
    expect(ids(viewDocuments(ALL, view({ types: ["receipt"], sources: ["email"] })))).toEqual([]);
  });

  it("sorts by each column in either direction, missing values first when ascending", () => {
    expect(ids(viewDocuments(ALL, view({ sortField: "file_name", sortDirection: "asc" })))).toEqual(["f", "i", "r"]);
    expect(ids(viewDocuments(ALL, view({ sortField: "file_name", sortDirection: "desc" })))).toEqual(["r", "i", "f"]);
    expect(ids(viewDocuments(ALL, view({ sortField: "status", sortDirection: "desc" })))[0]).toBe("f");
    expect(ids(viewDocuments(ALL, view({ sortField: "document_type", sortDirection: "asc" })))[0]).toBe("f");
    expect(ids(viewDocuments(ALL, view({ sortField: "source", sortDirection: "desc" })))[2]).toBe("i");
    expect(ids(viewDocuments(ALL, view({ sortField: "created_at", sortDirection: "asc" })))).toEqual(["r", "i", "f"]);
  });

  it("does not change the list it is given", () => {
    const given = [...ALL];
    viewDocuments(given, view({ sortDirection: "asc" }));
    expect(given).toEqual(ALL);
  });
});

describe("filter counts", () => {
  it("counts columns with a choice, not choices, and ignores search and order", () => {
    expect(activeDocumentFilterCount(DEFAULT_DOCUMENT_VIEW)).toBe(0);
    expect(activeDocumentFilterCount(view({ statuses: ["a", "b"], sources: ["email"], search: "x", sortDirection: "asc" }))).toBe(2);
  });

  it("knows the opening view", () => {
    expect(isDefaultDocumentView(DEFAULT_DOCUMENT_VIEW)).toBe(true);
    expect(isDefaultDocumentView(view({ search: "a" }))).toBe(false);
    expect(isDefaultDocumentView(view({ types: ["w2"] }))).toBe(false);
    expect(isDefaultDocumentView(view({ sortField: "status" }))).toBe(false);
    expect(isDefaultDocumentView(view({ sortDirection: "asc" }))).toBe(false);
  });
});
