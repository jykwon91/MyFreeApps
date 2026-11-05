import { describe, expect, it, vi } from "vitest";
import type { ReplyTemplate } from "../types/inquiry/reply-template";
import { restoreReplyTemplate } from "../utils/restoreReplyTemplate";

const ID = "tpl-1";
const row = { id: ID } as ReplyTemplate;

function deps(restoreError: unknown, reloaded: { isSuccess: boolean; data?: ReplyTemplate[] } = { isSuccess: true, data: [] }) {
  return {
    restore: vi.fn(() => (restoreError === null ? Promise.resolve() : Promise.reject(restoreError))),
    reloadArchived: vi.fn(() => Promise.resolve(reloaded)),
  };
}

describe("restoreReplyTemplate", () => {
  it("is restored when the server says so, without reloading", async () => {
    const d = deps(null);
    expect(await restoreReplyTemplate(ID, d)).toBe("restored");
    expect(d.reloadArchived).not.toHaveBeenCalled();
  });

  it("reloads the archived list when the template is gone", async () => {
    const d = deps({ status: 404 });
    expect(await restoreReplyTemplate(ID, d)).toBe("gone");
    expect(d.reloadArchived).toHaveBeenCalledOnce();
  });

  it("is view-only on a 403, and plain failed on a 422, without reloading", async () => {
    const forbidden = deps({ status: 403 });
    expect(await restoreReplyTemplate(ID, forbidden)).toBe("viewOnly");
    const invalid = deps({ status: 422 });
    expect(await restoreReplyTemplate(ID, invalid)).toBe("failed");
    expect(forbidden.reloadArchived).not.toHaveBeenCalled();
    expect(invalid.reloadArchived).not.toHaveBeenCalled();
  });

  it.each([undefined, 502])("settles a %s by the reloaded list", async (status) => {
    expect(await restoreReplyTemplate(ID, deps({ status }, { isSuccess: true, data: [] }))).toBe("restored");
    expect(await restoreReplyTemplate(ID, deps({ status }, { isSuccess: true, data: [row] }))).toBe("stillArchived");
    expect(await restoreReplyTemplate(ID, deps({ status }, { isSuccess: false }))).toBe("unsure");
  });
});
