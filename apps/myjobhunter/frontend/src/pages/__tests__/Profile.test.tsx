import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Profile from "@/pages/Profile";

// ---------------------------------------------------------------------------
// Mock dialog components — avoids radix-ui portal/overlay in jsdom
// ---------------------------------------------------------------------------

vi.mock("@/features/profile/ProfileHeaderDialog", () => ({
  default: () => null,
}));

vi.mock("@/features/profile/WorkHistoryDialog", () => ({
  default: () => null,
}));

vi.mock("@/features/profile/EducationDialog", () => ({
  default: () => null,
}));

vi.mock("@/features/profile/ScreeningAnswerDialog", () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Mock all RTK Query hooks — state controlled per-test via mockReturnValue.
// ---------------------------------------------------------------------------

vi.mock("@/lib/profileApi", () => ({
  useGetProfileQuery: vi.fn(),
  useUpdateProfileMutation: vi.fn(),
}));

vi.mock("@/lib/workHistoryApi", () => ({
  useListWorkHistoryQuery: vi.fn(),
  useCreateWorkHistoryMutation: vi.fn(),
  useUpdateWorkHistoryMutation: vi.fn(),
  useDeleteWorkHistoryMutation: vi.fn(),
}));

vi.mock("@/lib/educationApi", () => ({
  useListEducationQuery: vi.fn(),
  useCreateEducationMutation: vi.fn(),
  useUpdateEducationMutation: vi.fn(),
  useDeleteEducationMutation: vi.fn(),
}));

vi.mock("@/lib/skillsApi", () => ({
  useListSkillsQuery: vi.fn(),
  useCreateSkillMutation: vi.fn(),
  useDeleteSkillMutation: vi.fn(),
}));

vi.mock("@/lib/screeningAnswersApi", () => ({
  useListScreeningAnswersQuery: vi.fn(),
  useCreateScreeningAnswerMutation: vi.fn(),
  useUpdateScreeningAnswerMutation: vi.fn(),
  useDeleteScreeningAnswerMutation: vi.fn(),
}));

// Mock @platform/ui completely — avoids importing React 19 code from
// packages/shared-frontend into a React 18 test environment (two-copies crash).
vi.mock("@platform/ui", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  extractErrorMessage: (err: unknown) => String(err),
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  LoadingButton: ({
    children,
    isLoading,
    loadingText,
    onClick,
    type,
    className,
    disabled,
  }: {
    children: React.ReactNode;
    isLoading?: boolean;
    loadingText?: string;
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
    className?: string;
    disabled?: boolean;
  }) => (
    <button type={type} onClick={onClick} className={className} disabled={disabled}>
      {isLoading ? loadingText : children}
    </button>
  ),
}));

import {
  useGetProfileQuery,
  useUpdateProfileMutation,
} from "@/lib/profileApi";
import {
  useListWorkHistoryQuery,
  useDeleteWorkHistoryMutation,
  useCreateWorkHistoryMutation,
  useUpdateWorkHistoryMutation,
} from "@/lib/workHistoryApi";
import {
  useListEducationQuery,
  useDeleteEducationMutation,
  useCreateEducationMutation,
  useUpdateEducationMutation,
} from "@/lib/educationApi";
import { useListSkillsQuery, useCreateSkillMutation, useDeleteSkillMutation } from "@/lib/skillsApi";
import {
  useListScreeningAnswersQuery,
  useCreateScreeningAnswerMutation,
  useUpdateScreeningAnswerMutation,
  useDeleteScreeningAnswerMutation,
} from "@/lib/screeningAnswersApi";

const mockGetProfile = vi.mocked(useGetProfileQuery);
const mockUpdateProfile = vi.mocked(useUpdateProfileMutation);
const mockListWorkHistory = vi.mocked(useListWorkHistoryQuery);
const mockDeleteWorkHistory = vi.mocked(useDeleteWorkHistoryMutation);
const mockCreateWorkHistory = vi.mocked(useCreateWorkHistoryMutation);
const mockUpdateWorkHistory = vi.mocked(useUpdateWorkHistoryMutation);
const mockListEducation = vi.mocked(useListEducationQuery);
const mockDeleteEducation = vi.mocked(useDeleteEducationMutation);
const mockCreateEducation = vi.mocked(useCreateEducationMutation);
const mockUpdateEducation = vi.mocked(useUpdateEducationMutation);
const mockListSkills = vi.mocked(useListSkillsQuery);
const mockCreateSkill = vi.mocked(useCreateSkillMutation);
const mockDeleteSkill = vi.mocked(useDeleteSkillMutation);
const mockListScreening = vi.mocked(useListScreeningAnswersQuery);
const mockCreateScreening = vi.mocked(useCreateScreeningAnswerMutation);
const mockUpdateScreening = vi.mocked(useUpdateScreeningAnswerMutation);
const mockDeleteScreening = vi.mocked(useDeleteScreeningAnswerMutation);

// Generic stub for any mutation hook — all we need is isLoading: false and a no-op trigger.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubMutation = [vi.fn(), { isLoading: false }] as unknown as any;

const STUB_PROFILE = {
  id: "p1",
  user_id: "u1",
  resume_file_path: null,
  parser_version: null,
  parsed_at: null,
  work_auth_status: "citizen",
  desired_salary_min: "100000",
  desired_salary_max: "150000",
  salary_currency: "USD",
  salary_period: "annual",
  locations: ["San Francisco, CA"],
  remote_preference: "hybrid",
  seniority: "senior",
  summary: "Experienced engineer",
  timezone: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </MemoryRouter>,
  );
}

function setupAllMocks() {
  mockGetProfile.mockReturnValue({
    data: STUB_PROFILE,
    isLoading: false,
    isError: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetProfileQuery>);

  mockUpdateProfile.mockReturnValue(stubMutation as unknown as ReturnType<typeof useUpdateProfileMutation>);

  mockListWorkHistory.mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof useListWorkHistoryQuery>);

  mockListEducation.mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof useListEducationQuery>);

  mockListSkills.mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof useListSkillsQuery>);

  mockListScreening.mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof useListScreeningAnswersQuery>);

  mockDeleteWorkHistory.mockReturnValue(stubMutation);
  mockDeleteEducation.mockReturnValue(stubMutation);
  mockCreateWorkHistory.mockReturnValue(stubMutation);
  mockUpdateWorkHistory.mockReturnValue(stubMutation);
  mockCreateEducation.mockReturnValue(stubMutation);
  mockUpdateEducation.mockReturnValue(stubMutation);
  mockCreateSkill.mockReturnValue(stubMutation);
  mockDeleteSkill.mockReturnValue(stubMutation);
  mockCreateScreening.mockReturnValue(stubMutation);
  mockUpdateScreening.mockReturnValue(stubMutation);
  mockDeleteScreening.mockReturnValue(stubMutation);
}

describe("Profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("renders the skeleton while loading", () => {
      mockGetProfile.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useGetProfileQuery>);

      mockListWorkHistory.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as ReturnType<typeof useListWorkHistoryQuery>);
      mockListEducation.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useListEducationQuery>);
      mockListSkills.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useListSkillsQuery>);
      mockListScreening.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useListScreeningAnswersQuery>);
      mockUpdateProfile.mockReturnValue(stubMutation as unknown as ReturnType<typeof useUpdateProfileMutation>);
      mockDeleteWorkHistory.mockReturnValue(stubMutation);
      mockDeleteEducation.mockReturnValue(stubMutation);
      mockCreateWorkHistory.mockReturnValue(stubMutation);
      mockUpdateWorkHistory.mockReturnValue(stubMutation);
      mockCreateEducation.mockReturnValue(stubMutation);
      mockUpdateEducation.mockReturnValue(stubMutation);
      mockCreateSkill.mockReturnValue(stubMutation);
      mockDeleteSkill.mockReturnValue(stubMutation);
      mockCreateScreening.mockReturnValue(stubMutation);
      mockUpdateScreening.mockReturnValue(stubMutation);
      mockDeleteScreening.mockReturnValue(stubMutation);

      renderProfile();

      expect(screen.getByLabelText("Loading profile")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders an error message when profile fails to load", () => {
      mockGetProfile.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { status: 500 },
      } as unknown as ReturnType<typeof useGetProfileQuery>);

      mockListWorkHistory.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false } as unknown as ReturnType<typeof useListWorkHistoryQuery>);
      mockListEducation.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false } as unknown as ReturnType<typeof useListEducationQuery>);
      mockListSkills.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false } as unknown as ReturnType<typeof useListSkillsQuery>);
      mockListScreening.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false } as unknown as ReturnType<typeof useListScreeningAnswersQuery>);
      mockUpdateProfile.mockReturnValue(stubMutation as unknown as ReturnType<typeof useUpdateProfileMutation>);
      mockDeleteWorkHistory.mockReturnValue(stubMutation);
      mockDeleteEducation.mockReturnValue(stubMutation);
      mockCreateWorkHistory.mockReturnValue(stubMutation);
      mockUpdateWorkHistory.mockReturnValue(stubMutation);
      mockCreateEducation.mockReturnValue(stubMutation);
      mockUpdateEducation.mockReturnValue(stubMutation);
      mockCreateSkill.mockReturnValue(stubMutation);
      mockDeleteSkill.mockReturnValue(stubMutation);
      mockCreateScreening.mockReturnValue(stubMutation);
      mockUpdateScreening.mockReturnValue(stubMutation);
      mockDeleteScreening.mockReturnValue(stubMutation);

      renderProfile();

      expect(screen.getByText(/couldn't load profile/i)).toBeInTheDocument();
    });
  });

  describe("loaded state — all sections", () => {
    beforeEach(() => {
      setupAllMocks();
    });

    it("renders the salary preferences section", () => {
      renderProfile();
      expect(screen.getByText("Salary preferences")).toBeInTheDocument();
      expect(screen.getByText(/\$100,000/)).toBeInTheDocument();
    });

    it("renders the locations section with target location", () => {
      renderProfile();
      expect(screen.getByText("Locations")).toBeInTheDocument();
      expect(screen.getByText("San Francisco, CA")).toBeInTheDocument();
    });

    it("renders the work history section with add button", () => {
      renderProfile();
      expect(screen.getByText("Work history")).toBeInTheDocument();
      expect(screen.getByLabelText("Add work history")).toBeInTheDocument();
    });

    it("renders the education section with add button", () => {
      renderProfile();
      expect(screen.getByText("Education")).toBeInTheDocument();
      expect(screen.getByLabelText("Add education")).toBeInTheDocument();
    });

    it("renders the skills section", () => {
      renderProfile();
      expect(screen.getByText("Skills")).toBeInTheDocument();
    });

    it("renders the screening answers section with add button", () => {
      renderProfile();
      expect(screen.getByText("Screening answers")).toBeInTheDocument();
      expect(screen.getByLabelText("Add screening answer")).toBeInTheDocument();
    });

    it("shows empty messages when sub-resources have no items", () => {
      renderProfile();
      expect(screen.getByText(/no work history added yet/i)).toBeInTheDocument();
      expect(screen.getByText(/no education added yet/i)).toBeInTheDocument();
      expect(screen.getByText(/no skills added yet/i)).toBeInTheDocument();
      expect(screen.getByText(/no pre-filled answers yet/i)).toBeInTheDocument();
    });
  });

  describe("loaded state — with work history entries", () => {
    it("renders work history entries", () => {
      setupAllMocks();
      mockListWorkHistory.mockReturnValue({
        data: {
          items: [
            {
              id: "wh1",
              user_id: "u1",
              profile_id: "p1",
              company_name: "Acme Corp",
              title: "Senior Engineer",
              start_date: "2020-01-01",
              end_date: "2022-12-31",
              bullets: ["Led rewrite"],
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          total: 1,
        },
        isLoading: false,
      } as unknown as ReturnType<typeof useListWorkHistoryQuery>);

      renderProfile();
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
      expect(screen.getByText("Led rewrite")).toBeInTheDocument();
    });
  });

  describe("loaded state — with skills", () => {
    it("renders skill chips", () => {
      setupAllMocks();
      mockListSkills.mockReturnValue({
        data: {
          items: [
            {
              id: "s1",
              user_id: "u1",
              profile_id: "p1",
              name: "TypeScript",
              years_experience: 4,
              category: "language",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          total: 1,
        },
        isLoading: false,
      } as unknown as ReturnType<typeof useListSkillsQuery>);

      renderProfile();
      expect(screen.getByText("TypeScript")).toBeInTheDocument();
      expect(screen.getByText("4y")).toBeInTheDocument();
    });
  });

  describe("loaded state — with screening answers", () => {
    it("renders EEOC and non-EEOC answer groups", () => {
      setupAllMocks();
      mockListScreening.mockReturnValue({
        data: {
          items: [
            {
              id: "sa1",
              user_id: "u1",
              profile_id: "p1",
              question_key: "work_auth_us",
              answer: "Yes",
              is_eeoc: false,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
            {
              id: "sa2",
              user_id: "u1",
              profile_id: "p1",
              question_key: "eeoc_gender",
              answer: "Prefer not to say",
              is_eeoc: true,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          total: 2,
        },
        isLoading: false,
      } as unknown as ReturnType<typeof useListScreeningAnswersQuery>);

      renderProfile();
      expect(screen.getByText("Standard questions")).toBeInTheDocument();
      expect(screen.getByText("EEOC questions")).toBeInTheDocument();
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("Prefer not to say")).toBeInTheDocument();
    });
  });

  describe("skeleton layout", () => {
    it("ProfileSkeleton renders with aria-busy label", () => {
      mockGetProfile.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useGetProfileQuery>);

      mockListWorkHistory.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useListWorkHistoryQuery>);
      mockListEducation.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useListEducationQuery>);
      mockListSkills.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useListSkillsQuery>);
      mockListScreening.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useListScreeningAnswersQuery>);
      mockUpdateProfile.mockReturnValue(stubMutation as unknown as ReturnType<typeof useUpdateProfileMutation>);
      mockDeleteWorkHistory.mockReturnValue(stubMutation);
      mockDeleteEducation.mockReturnValue(stubMutation);
      mockCreateWorkHistory.mockReturnValue(stubMutation);
      mockUpdateWorkHistory.mockReturnValue(stubMutation);
      mockCreateEducation.mockReturnValue(stubMutation);
      mockUpdateEducation.mockReturnValue(stubMutation);
      mockCreateSkill.mockReturnValue(stubMutation);
      mockDeleteSkill.mockReturnValue(stubMutation);
      mockCreateScreening.mockReturnValue(stubMutation);
      mockUpdateScreening.mockReturnValue(stubMutation);
      mockDeleteScreening.mockReturnValue(stubMutation);

      renderProfile();

      const skeleton = screen.getByLabelText("Loading profile");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-busy", "true");
    });
  });
});
