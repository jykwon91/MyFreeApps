/** A list or profile that failed to load says so and offers a retry, instead of looking empty. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Profile from "@/pages/Profile";

vi.mock("@/features/profile/ProfileHeaderDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/WorkHistoryDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/EducationDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/ScreeningAnswerDialog", () => ({ default: () => null }));
vi.mock("@/features/profile/SkillAddForm", () => ({ default: () => null }));
vi.mock("@/features/profile/ResumeUploadSection", () => ({ default: () => null }));

const { mutation, queries } = vi.hoisted(() => ({
  mutation: () => [() => undefined, { isLoading: false }],
  queries: {
    profile: vi.fn(),
    workHistory: vi.fn(),
    education: vi.fn(),
    skills: vi.fn(),
    screening: vi.fn(),
  },
}));

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({ useGetProfileQuery: queries.profile, useUpdateProfileMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/workHistoryApi", () => ({ useListWorkHistoryQuery: queries.workHistory, useDeleteWorkHistoryMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/educationApi", () => ({ useListEducationQuery: queries.education, useDeleteEducationMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({ useListSkillsQuery: queries.skills, useDeleteSkillMutation: mutation }));
vi.mock("@myjobhunter/api-client/store/screeningAnswersApi", () => ({ useListScreeningAnswersQuery: queries.screening, useDeleteScreeningAnswerMutation: mutation }));

const PROFILE = {
  id: "p1", work_auth_status: "citizen", desired_salary_min: null, desired_salary_max: null, salary_currency: "USD", salary_period: "annual",
  locations: [], remote_preference: "hybrid", seniority: "senior", summary: "Experienced engineer", timezone: null,
};

const loaded = () => ({ currentData: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() });
const failed = () => ({ currentData: undefined, isLoading: false, isError: true, refetch: vi.fn().mockResolvedValue(undefined) });

function renderProfile() {
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

describe("Profile when a load fails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.profile.mockReturnValue({ data: PROFILE, isLoading: false, isError: false, refetch: vi.fn() });
    queries.workHistory.mockReturnValue(loaded());
    queries.education.mockReturnValue(loaded());
    queries.skills.mockReturnValue(loaded());
    queries.screening.mockReturnValue(loaded());
  });

  it.each([
    ["work history", queries.workHistory, "Work history", /No work history added yet/],
    ["education", queries.education, "Education", /No education added yet/],
    ["skills", queries.skills, "Skills", /No skills added yet/],
    ["screening answers", queries.screening, "Screening answers", /No pre-filled answers yet/],
  ])("shows the %s list as failed, not empty, and retries it", async (_name, query, title, emptyText) => {
    const state = failed();
    query.mockReturnValue(state);
    renderProfile();

    expect(screen.queryByText(emptyText)).not.toBeInTheDocument();
    const section = screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;
    expect(within(section).getByRole("alert")).toHaveTextContent(/couldn't load/i);

    fireEvent.click(within(section).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(state.refetch).toHaveBeenCalledTimes(1));
  });

  it("still says a list that loaded empty is empty", () => {
    renderProfile();
    expect(screen.getByText(/No work history added yet/)).toBeInTheDocument();
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("offers a retry when the profile itself fails to load", async () => {
    const state = failed();
    queries.profile.mockReturnValue({ ...state, data: undefined });
    renderProfile();

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load your profile/i);
    expect(screen.queryByText(/Try refreshing/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(state.refetch).toHaveBeenCalledTimes(1));
  });
});
