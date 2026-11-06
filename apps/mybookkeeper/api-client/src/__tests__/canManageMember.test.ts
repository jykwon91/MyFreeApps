import { describe, expect, it } from "vitest";
import { canManageMember } from "../utils/canManageMember";
import type { OrgRole } from "../types/organization/OrgRole";

const member = (org_role: OrgRole) => ({ org_role });

describe("canManageMember", () => {
  it("lets the owner manage admins, users and viewers", () => {
    for (const role of ["admin", "user", "viewer"] as const) {
      expect(canManageMember(member(role), "owner", false)).toBe(true);
    }
  });

  it("lets an admin manage users and viewers but not other admins", () => {
    expect(canManageMember(member("user"), "admin", false)).toBe(true);
    expect(canManageMember(member("viewer"), "admin", false)).toBe(true);
    expect(canManageMember(member("admin"), "admin", false)).toBe(false);
  });

  it("never allows changing the owner or yourself", () => {
    expect(canManageMember(member("owner"), "owner", false)).toBe(false);
    expect(canManageMember(member("owner"), "admin", false)).toBe(false);
    expect(canManageMember(member("admin"), "owner", true)).toBe(false);
  });

  it("gives users, viewers and an unknown role no controls", () => {
    for (const myRole of ["user", "viewer", null] as const) {
      expect(canManageMember(member("viewer"), myRole, false)).toBe(false);
    }
  });
});
