import { describe, expect, it } from "vitest";
import { writeFailure } from "../utils/writeFailure";

const failing = (status: number, detail?: string) => ({ status, data: detail === undefined ? undefined : { detail } });

describe("writeFailure", () => {
  it("treats an error with no response as the server being unreachable", () => {
    expect(writeFailure(new Error("Network Error"))).toBe("noResponse");
  });

  it("reads a viewer's 403 as view-only", () => {
    expect(writeFailure(failing(403, "Viewers have read-only access"))).toBe("viewOnly");
  });

  it("reads a role or membership 403 as view-only", () => {
    expect(writeFailure(failing(403, "Insufficient permissions in this organization"))).toBe("viewOnly");
    expect(writeFailure(failing(403))).toBe("viewOnly");
  });

  it("reads the demo workspace's 403 as its own kind, not view-only", () => {
    expect(writeFailure(failing(403, "This feature is not available for demo accounts"))).toBe("demo");
  });

  it.each([
    [404, "gone"],
    [409, "conflict"],
    [422, "invalid"],
    [500, "serverError"],
    [503, "serverError"],
    [400, "other"],
    [401, "other"],
    [413, "tooLarge"],
    [429, "rateLimited"],
  ])("maps %s to %s", (status, expected) => {
    expect(writeFailure(failing(status))).toBe(expected);
  });

  it("does not read the demo wording on other statuses as a demo refusal", () => {
    expect(writeFailure(failing(409, "This feature is not available for demo accounts"))).toBe("conflict");
  });
});
