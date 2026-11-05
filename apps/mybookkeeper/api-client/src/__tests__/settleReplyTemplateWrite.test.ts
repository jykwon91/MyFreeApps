import { describe, expect, it, vi } from "vitest";
import type { ReplyTemplate } from "../types/inquiry/reply-template";
import { settleReplyTemplateWrite } from "../utils/settleReplyTemplateWrite";

const ID = "tpl-1";
const row = { id: ID } as ReplyTemplate;

function steps(writeError: unknown, reloaded: { isSuccess: boolean; data?: ReplyTemplate[] } = { isSuccess: true, data: [] }) {
  return {
    write: vi.fn(() => (writeError === null ? Promise.resolve() : Promise.reject(writeError))),
    reloadList: vi.fn(() => Promise.resolve(reloaded)),
  };
}

describe("settleReplyTemplateWrite", () => {
  it("is done when the server says so, without reloading", async () => {
    const s = steps(null);
    expect(await settleReplyTemplateWrite(ID, s)).toBe("done");
    expect(s.reloadList).not.toHaveBeenCalled();
  });

  it("says a 404 had already left the list, and reloads it", async () => {
    const s = steps({ status: 404 });
    expect(await settleReplyTemplateWrite(ID, s)).toBe("gone");
    expect(s.reloadList).toHaveBeenCalledOnce();
  });

  it.each([
    [403, "viewOnly"],
    [409, "failed"],
    [422, "failed"],
  ] as const)("answers %s with %s, without reloading", async (status, expected) => {
    const s = steps({ status });
    expect(await settleReplyTemplateWrite(ID, s)).toBe(expected);
    expect(s.reloadList).not.toHaveBeenCalled();
  });

  it("settles a lost answer by the reloaded list", async () => {
    const lost = new Error("Network Error");
    expect(await settleReplyTemplateWrite(ID, steps(lost, { isSuccess: true, data: [] }))).toBe("done");
    expect(await settleReplyTemplateWrite(ID, steps(lost, { isSuccess: true, data: [row] }))).toBe("unreachable");
    expect(await settleReplyTemplateWrite(ID, steps(lost, { isSuccess: false }))).toBe("unsure");
  });

  it.each([500, 502])("settles a %s by the reloaded list too", async (status) => {
    expect(await settleReplyTemplateWrite(ID, steps({ status }, { isSuccess: true, data: [] }))).toBe("done");
    expect(await settleReplyTemplateWrite(ID, steps({ status }, { isSuccess: true, data: [row] }))).toBe("stillListed");
    expect(await settleReplyTemplateWrite(ID, steps({ status }, { isSuccess: false }))).toBe("unsure");
  });
});
