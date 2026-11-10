import { normalizeSearchText, searchJoined, searchWords } from "../src/utils/normalizeSearchText";

describe("normalizeSearchText", () => {
  it("lowercases, strips accents and drops quotes", () => {
    expect(normalizeSearchText("Résumé Tenant’s “Notes”")).toBe("resume tenants  notes ");
  });
});

describe("searchWords and searchJoined", () => {
  it("splits on anything that is not a letter or digit", () => {
    expect(searchWords("Property P&L / W-2")).toEqual(["property", "p", "l", "w", "2"]);
  });

  it("runs the words together", () => {
    expect(searchJoined("w-2")).toBe("w2");
    expect(searchJoined("p & l")).toBe(searchJoined("P&L"));
  });
});
