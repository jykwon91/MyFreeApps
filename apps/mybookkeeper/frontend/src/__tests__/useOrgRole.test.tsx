import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import organizationReducer from "@/shared/store/organizationSlice";
import { useCanWrite, useIsOrgAdmin, useOrgRole } from "@/shared/hooks/useOrgRole";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";

function renderRoleHooks(role: OrgRole | null) {
  const store = configureStore({
    reducer: { organization: organizationReducer },
    preloadedState: {
      organization: {
        activeOrgId: "org-1",
        organizations: role
          ? [{ id: "org-1", name: "Test Org", org_role: role, is_demo: false, created_at: "2026-01-01T00:00:00Z" }]
          : [],
      },
    },
  });
  return renderHook(
    () => ({ role: useOrgRole(), canWrite: useCanWrite(), isAdmin: useIsOrgAdmin() }),
    { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> },
  ).result.current;
}

describe("useOrgRole hooks", () => {
  it.each([
    ["owner", true, true],
    ["admin", true, true],
    ["user", true, false],
    ["viewer", false, false],
  ] as const)("%s: canWrite=%s, isAdmin=%s", (role, canWrite, isAdmin) => {
    expect(renderRoleHooks(role)).toEqual({ role, canWrite, isAdmin });
  });

  it("gives no write or admin access while the role is unknown", () => {
    expect(renderRoleHooks(null)).toEqual({ role: null, canWrite: false, isAdmin: false });
  });
});
