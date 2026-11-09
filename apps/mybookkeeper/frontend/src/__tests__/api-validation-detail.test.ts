import { describe, it, expect } from "vitest";
import { getApiValidationDetail } from "@/shared/lib/api-validation-detail";

const FALLBACK = "fallback";

describe("getApiValidationDetail", () => {
  it("returns a string detail", () => {
    expect(getApiValidationDetail({ data: { detail: "box_1 is a masked value" } }, FALLBACK))
      .toBe("box_1 is a masked value");
  });

  it("joins the msg of a Pydantic list and drops the Value error prefix", () => {
    const error = {
      data: {
        detail: [
          { msg: "Value error, Send at least one value", loc: ["body"] },
          { msg: "String should have at most 500 characters" },
        ],
      },
    };
    expect(getApiValidationDetail(error, FALLBACK))
      .toBe("Send at least one value String should have at most 500 characters");
  });

  it("falls back when there is no usable detail", () => {
    expect(getApiValidationDetail({ data: { detail: [{}] } }, FALLBACK)).toBe(FALLBACK);
    expect(getApiValidationDetail(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
