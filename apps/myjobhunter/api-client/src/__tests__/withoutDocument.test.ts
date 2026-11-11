import { describe, expect, it } from "vitest";
import type { Document } from "../types/document/document";
import type { DocumentListResponse } from "../types/document/document-list-response";
import { withoutDocument } from "../utils/withoutDocument";

const item = (id: string) => ({ id }) as Document;
const page = (ids: string[], total: number): DocumentListResponse => ({ items: ids.map(item), total });
const loaded = (...pages: DocumentListResponse[]) => ({ pages, pageParams: pages.map((_, index) => index * 2) });

describe("withoutDocument", () => {
  it("takes the document out and lowers the total", () => {
    expect(withoutDocument(loaded(page(["a", "b"], 2)), "a").pages).toEqual([page(["b"], 1)]);
  });

  it("takes a document out of a later page and lowers every page's total", () => {
    const result = withoutDocument(loaded(page(["a", "b"], 5), page(["c", "d"], 5)), "d");
    expect(result.pages).toEqual([page(["a", "b"], 4), page(["c"], 4)]);
  });

  it("lowers the total once for a document that sits on two loaded pages", () => {
    // A row can shift onto the next page between loads, so both pages hold it.
    const result = withoutDocument(loaded(page(["a", "b"], 5), page(["b", "c"], 5)), "b");
    expect(result.pages).toEqual([page(["a"], 4), page(["c"], 4)]);
  });

  it("keeps the page params", () => {
    const data = loaded(page(["a"], 3), page(["b"], 3));
    expect(withoutDocument(data, "a").pageParams).toEqual(data.pageParams);
  });

  it("changes nothing when the document isn't in a loaded page", () => {
    const data = loaded(page(["a"], 5));
    expect(withoutDocument(data, "z")).toBe(data);
  });

  it("never takes the total below zero", () => {
    expect(withoutDocument(loaded(page(["a"], 0)), "a").pages[0].total).toBe(0);
  });
});
