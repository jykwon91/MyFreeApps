import { describe, expect, it } from "vitest";
import type { ReplyTemplate } from "../types/inquiry/reply-template";
import { checkStillListed } from "../utils/checkStillListed";
import { archiveFailure, restoreFailure, saveFailure } from "../utils/replyTemplateFailure";

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

  it("never reads a 409 on archive as a taken name, and doesn't check the list after a 5xx", () => {
    expect(archiveFailure({ status: 409 })).toBe("other");
    expect(archiveFailure({ status: 404 })).toBe("gone");
    expect(archiveFailure({ status: undefined })).toBe("noResponse");
    expect(archiveFailure({ status: 403 })).toBe("viewOnly");
    expect(archiveFailure({ status: 502 })).toBe("other");
  });

  it("never reads a 409 on restore as a taken name, but keeps a 5xx so the list gets checked", () => {
    expect(restoreFailure({ status: 409 })).toBe("other");
    expect(restoreFailure({ status: 422 })).toBe("other");
    expect(restoreFailure({ status: 404 })).toBe("gone");
    expect(restoreFailure({ status: 403 })).toBe("viewOnly");
    expect(restoreFailure({ status: 500 })).toBe("serverError");
    expect(restoreFailure(new Error("Network Error"))).toBe("noResponse");
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
