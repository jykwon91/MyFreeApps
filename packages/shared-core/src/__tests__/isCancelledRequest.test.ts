import { describe, expect, it } from "vitest";
import { isCancelledRequest } from "../utils/isCancelledRequest";

describe("isCancelledRequest", () => {
  it("recognises the rejection RTK Query gives an aborted request", () => {
    expect(isCancelledRequest({ name: "AbortError", message: "Aborted" })).toBe(true);
  });

  it("ignores answers, lost answers and other shapes", () => {
    expect(isCancelledRequest({ status: 500, data: { detail: "x" } })).toBe(false);
    expect(isCancelledRequest({ status: "FETCH_ERROR", error: "Network Error" })).toBe(false);
    expect(isCancelledRequest({ name: "Error" })).toBe(false);
    expect(isCancelledRequest(null)).toBe(false);
    expect(isCancelledRequest("AbortError")).toBe(false);
  });
});
