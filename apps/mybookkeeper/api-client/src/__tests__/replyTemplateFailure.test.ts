import { describe, expect, it } from "vitest";
import type { ReplyTemplate } from "../types/inquiry/reply-template";
import { checkStillListed } from "../utils/checkStillListed";
import { saveFailure } from "../utils/replyTemplateFailure";

describe("reply template failures", () => {
  it.each([
    [undefined, "noResponse"],
    [403, "viewOnly"],
    [404, "gone"],
    [409, "nameTaken"],
    [422, "other"],
    [500, "serverError"],
    [502, "serverError"],
  ] as const)("a save that fails with %s is %s", (status, expected) => {
    expect(saveFailure({ status })).toBe(expected);
  });

  it("treats an error with no status as no response", () => {
    expect(saveFailure(new Error("Network Error"))).toBe("noResponse");
  });
});

describe("checkStillListed", () => {
  const row = { id: "t1" } as ReplyTemplate;

  it("is unsure when the list couldn't reload", async () => {
    expect(await checkStillListed(() => Promise.resolve({ isSuccess: false }), "t1")).toBe("unsure");
  });

  it("says it's still listed when the reloaded list has it", async () => {
    expect(await checkStillListed(() => Promise.resolve({ isSuccess: true, data: [row] }), "t1")).toBe("stillListed");
  });

  it("says it's gone when the reloaded list doesn't", async () => {
    expect(await checkStillListed(() => Promise.resolve({ isSuccess: true, data: [] }), "t1")).toBe("gone");
  });
});
