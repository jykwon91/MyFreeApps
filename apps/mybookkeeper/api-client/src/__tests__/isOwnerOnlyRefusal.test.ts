import { describe, expect, it } from "vitest";
import { isOwnerOnlyRefusal } from "../utils/isOwnerOnlyRefusal";

describe("isOwnerOnlyRefusal", () => {
  it("recognises both owner-only refusals", () => {
    expect(isOwnerOnlyRefusal({ status: 403, data: { detail: "Only the owner can change an admin's role" } })).toBe(true);
    expect(isOwnerOnlyRefusal({ status: 403, data: { detail: "Only the owner can remove an admin" } })).toBe(true);
  });

  it("ignores other refusals and shapes", () => {
    expect(isOwnerOnlyRefusal({ status: 403, data: { detail: "Not a member of this organization" } })).toBe(false);
    expect(isOwnerOnlyRefusal({ status: 403, data: { detail: [{ msg: "x" }] } })).toBe(false);
    expect(isOwnerOnlyRefusal(null)).toBe(false);
  });
});
