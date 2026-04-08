import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetItem = vi.fn();
const mockSetItem = vi.fn();
const mockRemoveItem = vi.fn();

vi.stubGlobal("localStorage", {
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
});

import reducer, {
  setActiveOrg,
  setOrganizations,
  clearOrganizationState,
} from "@/shared/store/organizationSlice";
import type { OrgWithRole } from "@/shared/types/organization/org-with-role";

function makeOrg(overrides: Partial<OrgWithRole> = {}): OrgWithRole {
  return {
    id: crypto.randomUUID(),
    name: "Test Org",
    org_role: "owner",
    is_demo: false,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("organizationSlice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockReturnValue(null);
  });

  it("setActiveOrg stores org id and persists to localStorage", () => {
    const state = reducer(
      { activeOrgId: null, organizations: [] },
      setActiveOrg("org-123"),
    );

    expect(state.activeOrgId).toBe("org-123");
    expect(mockSetItem).toHaveBeenCalledWith("v1_activeOrgId", "org-123");
  });

  it("setActiveOrg with null removes from localStorage", () => {
    const state = reducer(
      { activeOrgId: "org-123", organizations: [] },
      setActiveOrg(null),
    );

    expect(state.activeOrgId).toBeNull();
    expect(mockRemoveItem).toHaveBeenCalledWith("v1_activeOrgId");
  });

  it("setOrganizations sets the list and auto-selects first if no active", () => {
    const org1 = makeOrg({ id: "org-1" });
    const org2 = makeOrg({ id: "org-2" });

    const state = reducer(
      { activeOrgId: null, organizations: [] },
      setOrganizations([org1, org2]),
    );

    expect(state.organizations).toHaveLength(2);
    expect(state.activeOrgId).toBe("org-1");
  });

  it("setOrganizations keeps activeOrgId if still valid", () => {
    const org1 = makeOrg({ id: "org-1" });
    const org2 = makeOrg({ id: "org-2" });

    const state = reducer(
      { activeOrgId: "org-2", organizations: [] },
      setOrganizations([org1, org2]),
    );

    expect(state.activeOrgId).toBe("org-2");
  });

  it("setOrganizations resets activeOrgId if no longer valid", () => {
    const org1 = makeOrg({ id: "org-1" });

    const state = reducer(
      { activeOrgId: "org-deleted", organizations: [] },
      setOrganizations([org1]),
    );

    expect(state.activeOrgId).toBe("org-1");
  });

  it("setOrganizations with empty list sets activeOrgId to null", () => {
    const state = reducer(
      { activeOrgId: "org-1", organizations: [] },
      setOrganizations([]),
    );

    expect(state.activeOrgId).toBeNull();
  });

  it("clearOrganizationState resets everything", () => {
    const org = makeOrg({ id: "org-1" });

    const state = reducer(
      { activeOrgId: "org-1", organizations: [org] },
      clearOrganizationState(),
    );

    expect(state.activeOrgId).toBeNull();
    expect(state.organizations).toHaveLength(0);
    expect(mockRemoveItem).toHaveBeenCalledWith("v1_activeOrgId");
  });
});
