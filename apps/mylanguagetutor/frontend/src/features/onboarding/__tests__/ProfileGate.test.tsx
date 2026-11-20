import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import ProfileGate from "@/features/onboarding/ProfileGate";

interface ProfileQueryState {
  data: Profile | null | undefined;
  isError: boolean;
  refetch: () => void;
}

let query: ProfileQueryState;

vi.mock("@mylanguagetutor/api-client/store/profileApi", () => ({
  useGetProfileQuery: () => query,
}));

const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };

function gate() {
  return (
    <MemoryRouter>
      <ProfileGate>{() => <div>conversation in progress</div>}</ProfileGate>
    </MemoryRouter>
  );
}

describe("ProfileGate", () => {
  beforeEach(() => {
    query = { data: PROFILE, isError: false, refetch: vi.fn() };
  });

  it("keeps the children on screen when a background refetch of a cached profile fails", () => {
    query = { ...query, isError: true };
    render(gate());
    expect(screen.getByText("conversation in progress")).toBeTruthy();
    expect(screen.queryByText(CATALOG_COPY.loadFailed)).toBeNull();
  });

  it("shows the load error when there is no profile at all", () => {
    query = { data: undefined, isError: true, refetch: vi.fn() };
    render(gate());
    expect(screen.getByText(CATALOG_COPY.loadFailed)).toBeTruthy();
    expect(screen.queryByText("conversation in progress")).toBeNull();
  });
});
