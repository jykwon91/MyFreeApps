import { describe, expect, it } from "vitest";
import type { Document } from "../types/document/document";
import { withoutDocument } from "../utils/withoutDocument";

const item = (id: string) => ({ id }) as Document;

describe("withoutDocument", () => {
  it("takes the document out and lowers the total", () => {
    expect(withoutDocument({ items: [item("a"), item("b")], total: 2 }, "a")).toEqual({ items: [item("b")], total: 1 });
  });

  it("changes nothing when the document isn't in the list", () => {
    expect(withoutDocument({ items: [item("a")], total: 5 }, "z")).toEqual({ items: [item("a")], total: 5 });
  });
});
