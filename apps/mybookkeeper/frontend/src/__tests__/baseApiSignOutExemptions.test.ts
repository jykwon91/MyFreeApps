import { isExemptFromSignOut } from "@platform/core/lib/signOutExemptions";
import { expect, it } from "vitest";
import "@/shared/store/baseApi";

it("registers the sign-out exemptions for queries that never import the axios module", () => {
  expect(isExemptFromSignOut("/integrations/gmail/sync")).toBe(true);
  expect(isExemptFromSignOut("/public/welcome-manuals/abc")).toBe(true);
  expect(isExemptFromSignOut("/users/me")).toBe(false);
});
