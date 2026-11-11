import { describe, it, expect } from "vitest";
import { documentsEmptyKind } from "@/lib/documentsEmptyKind";

describe("documentsEmptyKind", () => {
  it("is no-documents when nothing exists and no filter is applied", () => {
    expect(documentsEmptyKind(0, 0, "all")).toBe("no-documents");
  });

  it("is no-matches when nothing exists under a filter", () => {
    expect(documentsEmptyKind(0, 0, "tailored_resume")).toBe("no-matches");
  });

  it("is none when the server total is positive even if the loaded page is empty", () => {
    expect(documentsEmptyKind(75, 0, "all")).toBe("none");
  });

  it("is none when rows are loaded", () => {
    expect(documentsEmptyKind(1, 1, "tailored_resume")).toBe("none");
  });
});
