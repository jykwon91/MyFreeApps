import { describe, expect, it } from "vitest";
import { isIntegerParam } from "../utils/isIntegerParam";
import { isUuid } from "../utils/isUuid";
import { isYearParam } from "../utils/isYearParam";

describe("isUuid", () => {
  it("accepts a UUID in either case", () => {
    expect(isUuid("3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b")).toBe(true);
    expect(isUuid("3F2B8C1E-9D4A-4E7B-8A6F-1C2D3E4F5A6B")).toBe(true);
  });

  it.each(["abc", "", "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6", "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b-x", undefined, ["3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b"]])(
    "rejects %p",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});

describe("isYearParam", () => {
  it("accepts a four-digit year", () => {
    expect(isYearParam("2025")).toBe(true);
  });

  it.each(["", "abc", "25", "20255", "2025.5", "-2025", undefined])("rejects %p", (value) => {
    expect(isYearParam(value)).toBe(false);
  });
});

describe("isIntegerParam", () => {
  it("accepts a positive whole number", () => {
    expect(isIntegerParam("42")).toBe(true);
  });

  it.each(["", "0", "abc", "4.2", "-3", "042", undefined])("rejects %p", (value) => {
    expect(isIntegerParam(value)).toBe(false);
  });
});
