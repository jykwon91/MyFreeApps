import { describe, expect, it } from "vitest";
import { DOCUMENT_KIND_FILTER_OPTIONS } from "../constants/documentKindFilterOptions";
import { DOCUMENT_KIND_OPTIONS } from "../constants/documentKindOptions";
import { documentsFilter } from "../utils/documentsFilter";

describe("documentsFilter", () => {
  it("sends no kind for every type", () => {
    expect(documentsFilter("all")).toEqual({});
  });

  it("sends the chosen kind", () => {
    expect(documentsFilter("job_description")).toEqual({ kind: "job_description" });
  });

  it("narrows to one application when given", () => {
    expect(documentsFilter("all", "a1")).toEqual({ application_id: "a1" });
    expect(documentsFilter("portfolio", "a1")).toEqual({ application_id: "a1", kind: "portfolio" });
  });
});

describe("DOCUMENT_KIND_FILTER_OPTIONS", () => {
  it("offers every type first, then each kind in order", () => {
    expect(DOCUMENT_KIND_FILTER_OPTIONS[0]).toEqual({ value: "all", label: "All types" });
    expect(DOCUMENT_KIND_FILTER_OPTIONS.slice(1)).toEqual(DOCUMENT_KIND_OPTIONS);
  });
});
