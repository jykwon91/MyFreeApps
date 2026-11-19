import { describe, expect, it } from "vitest";
import { duplicateConflictMessage } from "../utils/duplicateConflictMessage";

const REASON = "These transactions are linked to different tenants. Set the same one on both, or clear it on one of them, then try again.";

describe("duplicateConflictMessage", () => {
  it("gives the server's reason for a refused merge", () => {
    expect(duplicateConflictMessage({ status: 409, data: { detail: REASON } })).toBe(REASON);
  });

  it("is null for any other failure", () => {
    expect(duplicateConflictMessage({ status: 422, data: { detail: REASON } })).toBeNull();
    expect(duplicateConflictMessage({ status: 409, data: { detail: { code: "x" } } })).toBeNull();
    expect(duplicateConflictMessage({ status: 409, data: { detail: "" } })).toBeNull();
    expect(duplicateConflictMessage({ status: "FETCH_ERROR", error: "offline" })).toBeNull();
  });
});
