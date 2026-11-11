// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryDefaultsPrefill } from "../hooks/useDiscoveryDefaultsPrefill";
import type { Profile } from "../types/profile/profile";

interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
}

const queries = vi.hoisted(() => ({
  profile: { data: undefined, isLoading: true } as QueryState<unknown>,
  skills: { data: { items: [], total: 0 }, isLoading: false } as QueryState<unknown>,
  workHistory: { data: undefined, isLoading: true } as QueryState<unknown>,
}));

vi.mock("../store/profileApi", () => ({ useGetProfileQuery: () => queries.profile }));
vi.mock("../store/skillsApi", () => ({ useListSkillsQuery: () => queries.skills }));
vi.mock("../store/workHistoryApi", () => ({ useListWorkHistoryQuery: () => queries.workHistory }));

const PROFILE = { remote_preference: "no_preference", desired_salary_min: null, seniority: null, discovery_defaults: {} } as unknown as Profile;

describe("useDiscoveryDefaultsPrefill", () => {
  beforeEach(() => {
    queries.profile = { data: undefined, isLoading: true };
    queries.workHistory = { data: undefined, isLoading: true };
  });

  it("waits for work history when the profile loads first, so the latest title becomes the role", () => {
    const onPrefill = vi.fn();
    const { rerender } = renderHook(() => useDiscoveryDefaultsPrefill(true, onPrefill));

    queries.profile = { data: PROFILE, isLoading: false };
    rerender();
    expect(onPrefill).not.toHaveBeenCalled();

    queries.workHistory = { data: { items: [{ title: "Staff Engineer" }], total: 1 }, isLoading: false };
    rerender();
    expect(onPrefill).toHaveBeenCalledTimes(1);
    expect(onPrefill.mock.calls[0][0]).toMatchObject({ roles: ["Staff Engineer"] });
  });

  it("fills in once per opening, without a role when there is no work history", () => {
    const onPrefill = vi.fn();
    queries.profile = { data: PROFILE, isLoading: false };
    queries.workHistory = { data: { items: [], total: 0 }, isLoading: false };
    const { rerender } = renderHook(() => useDiscoveryDefaultsPrefill(true, onPrefill));
    rerender();

    expect(onPrefill).toHaveBeenCalledTimes(1);
    expect(onPrefill.mock.calls[0][0]).not.toHaveProperty("roles");
  });
});
