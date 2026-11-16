/** A failed refetch with the profile already loaded keeps the page (and its open dialogs) on screen. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Profile from "@/pages/Profile";

vi.mock("@/features/profile/ProfileHeaderDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/WorkHistoryDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/EducationDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/ScreeningAnswerDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/SkillAddForm", () => ({ default: () => null }));
vi.mock("@/features/profile/ResumeUploadSection", () => ({ default: () => <div data-testid="resume-upload-section" /> }));

const { mutation, list } = vi.hoisted(() => ({
  mutation: () => [() => undefined, { isLoading: false }],
  list: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({ useGetProfileQuery: vi.fn(), useUpdateProfileMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/workHistoryApi", () => ({ useListWorkHistoryQuery: list, useDeleteWorkHistoryMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/educationApi", () => ({ useListEducationQuery: list, useDeleteEducationMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({ useListSkillsQuery: list, useDeleteSkillMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/screeningAnswersApi", () => ({ useListScreeningAnswersQuery: list, useDeleteScreeningAnswerMutation: mutation }));

import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";

const PROFILE = {
  id: "p1", work_auth_status: "citizen", desired_salary_min: null, desired_salary_max: null, salary_currency: "USD", salary_period: "annual",
  locations: ["San Francisco, CA"], remote_preference: "hybrid", seniority: "senior", summary: "Experienced engineer", timezone: null,
};

function renderProfile(profile: object | undefined) {
  vi.mocked(useGetProfileQuery).mockReturnValue({ data: profile, isLoading: false, isError: true } as unknown as ReturnType<typeof useGetProfileQuery>);
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

describe("Profile when a refetch fails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the profile on screen", () => {
    renderProfile(PROFILE);
    expect(screen.getByText("Experienced engineer")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load profile/)).not.toBeInTheDocument();
  });

  it("still says it couldn't load when there is nothing to show", () => {
    renderProfile(undefined);
    expect(screen.getByText(/Couldn't load profile/)).toBeInTheDocument();
  });
});
