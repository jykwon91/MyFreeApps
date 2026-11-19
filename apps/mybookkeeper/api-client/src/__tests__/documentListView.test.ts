import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT_VIEW } from "../constants/documentListView";
import type { DocumentListView } from "../types/document/DocumentListView";
import { documentFilterQuery, documentListQuery } from "../utils/documentListQuery";
import { activeDocumentFilterCount, isDefaultDocumentView } from "../utils/documentListView";

const view = (change: Partial<DocumentListView>): DocumentListView => ({ ...DEFAULT_DOCUMENT_VIEW, ...change });

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

describe("the query a page of documents asks with", () => {
  it("sends nothing for the opening view but the order", () => {
    expect(documentListQuery(DEFAULT_DOCUMENT_VIEW)).toBe("sort_by=created_at&sort_dir=desc");
    expect(documentFilterQuery(DEFAULT_DOCUMENT_VIEW)).toBe("");
  });

  it("repeats a key per choice, trims the search, and names the server's parameters", () => {
    const args = { ...view({ search: "  a&b ", statuses: ["failed", "duplicate"], types: [""], sources: ["email"] }), excludeProcessing: true, needsReview: true };
    expect(documentFilterQuery(args)).toBe(
      "search=a%26b&statuses=failed&statuses=duplicate&document_types=&sources=email&exclude_processing=true&needs_review=true",
    );
    expect(documentListQuery({ ...args, sortField: "file_name", sortDirection: "asc" })).toBe(
      `${documentFilterQuery(args)}&sort_by=file_name&sort_dir=asc`,
    );
  });
});
