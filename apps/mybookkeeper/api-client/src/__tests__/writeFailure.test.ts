import { describe, expect, it } from "vitest";
import { writeFailure } from "../utils/writeFailure";

const failing = (status: number) => ({ status });

describe("writeFailure", () => {
  it("treats an error with no response as the server being unreachable", () => {
    expect(writeFailure(new Error("Network Error"))).toBe("noResponse");
  });

  it.each([
    [403, "viewOnly"],
    [404, "gone"],
    [409, "conflict"],
    [422, "invalid"],
    [500, "serverError"],
    [503, "serverError"],
    [400, "other"],
    [401, "other"],
  ])("maps %s to %s", (status, expected) => {
    expect(writeFailure(failing(status))).toBe(expected);
  });
});
