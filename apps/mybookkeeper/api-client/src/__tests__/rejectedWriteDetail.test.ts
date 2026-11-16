import { describe, expect, it } from "vitest";
import { rejectedWriteDetail } from "../utils/rejectedWriteDetail";

const FALLBACK = "I couldn't save your changes. Mind trying again?";

describe("rejectedWriteDetail", () => {
  it("shows the server's reason for a 422", () => {
    const error = { status: 422, data: { detail: [{ msg: "Value error, Use dollars and cents, like 84.20." }] } };
    expect(rejectedWriteDetail(error, FALLBACK)).toBe("Use dollars and cents, like 84.20.");
  });

  it("falls back when a 422 carries nothing readable", () => {
    expect(rejectedWriteDetail({ status: 422, data: {} }, FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    ["a 500", { status: 500, data: { detail: "boom" } }],
    ["no response", { status: "FETCH_ERROR", error: "offline" }],
    ["a 403", { status: 403, data: { detail: "Forbidden" } }],
  ])("never shows the server's wording for %s", (_label, error) => {
    expect(rejectedWriteDetail(error, FALLBACK)).toBe(FALLBACK);
  });
});
