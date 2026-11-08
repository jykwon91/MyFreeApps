import { describe, expect, it } from "vitest";
import { inviteAgainRole } from "../utils/inviteAgainRole";

describe("inviteAgainRole", () => {
  it("keeps the role the invite had", () => {
    expect(inviteAgainRole({ org_role: "admin" })).toBe("admin");
    expect(inviteAgainRole({ org_role: "user" })).toBe("user");
    expect(inviteAgainRole({ org_role: "viewer" })).toBe("viewer");
  });

  it("sends an old owner invite out as a user, since nobody can be invited as an owner", () => {
    expect(inviteAgainRole({ org_role: "owner" })).toBe("user");
  });
});
