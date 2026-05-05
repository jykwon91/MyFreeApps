/**
 * Unit tests for ResumeUploadSection.
 *
 * Covers:
 *   - renders empty state when no jobs exist
 *   - renders job list rows when jobs exist
 *   - calls the upload mutation with FormData when a file is selected
 *   - shows a success toast on successful upload
 *   - shows an error toast on failed upload
 *   - renders skeleton while loading
 *
 * Testing pattern mirrors Profile.test.tsx exactly to share the same
 * mock wiring strategy for @platform/ui and the RTK Query hooks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResumeUploadJob } from "@/types/resume-upload-job/resume-upload-job";

// ---------------------------------------------------------------------------
// Mock API hooks — declared before component import per Vitest hoisting rules.
// ---------------------------------------------------------------------------

vi.mock("@/lib/resumesApi", () => ({
  useUploadResumeMutation: vi.fn(),
  useListResumeJobsQuery: vi.fn(),
  useGetResumeDownloadUrlQuery: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock child components — use the same null-return pattern as Profile.test.tsx
// avoids lucide-react / @platform/ui deep render in unit tests.
// ---------------------------------------------------------------------------

vi.mock("@/features/profile/ResumeJobRow", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/features/profile/ResumeUploadSectionSkeleton", () => ({
  default: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Mock @platform/ui — mirrors Profile.test.tsx exactly.
// FileUploadDropzone is added here to avoid importing the real component.
// ---------------------------------------------------------------------------

vi.mock("@platform/ui", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  extractErrorMessage: (err: unknown) => String(err),
  FileUploadDropzone: ({
    onFilesSelected,
    uploading,
  }: {
    onFilesSelected: (files: File[]) => void;
    uploading?: boolean;
    label?: string;
    helperText?: string;
    accept?: string;
    maxSizeBytes?: number;
  }) => (
    <div>
      {uploading && <span>Uploading...</span>}
      <input
        data-testid="file-input"
        type="file"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFilesSelected(files);
        }}
      />
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Imports — after all vi.mock calls.
// ---------------------------------------------------------------------------

import {
  useUploadResumeMutation,
  useListResumeJobsQuery,
  useGetResumeDownloadUrlQuery,
} from "@/lib/resumesApi";
import { showSuccess, showError } from "@platform/ui";
import ResumeJobRow from "@/features/profile/ResumeJobRow";
import ResumeUploadSectionSkeleton from "@/features/profile/ResumeUploadSectionSkeleton";
import ResumeUploadSection from "@/features/profile/ResumeUploadSection";

const mockUseUploadResume = vi.mocked(useUploadResumeMutation);
const mockUseListResumeJobs = vi.mocked(useListResumeJobsQuery);
const mockUseGetDownloadUrl = vi.mocked(useGetResumeDownloadUrlQuery);
const mockShowSuccess = vi.mocked(showSuccess);
const mockShowError = vi.mocked(showError);
const mockResumeJobRow = vi.mocked(ResumeJobRow);
const mockResumeUploadSectionSkeleton = vi.mocked(ResumeUploadSectionSkeleton);

// Generic stub mutation: [trigger, { isLoading: false }]
const stubMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useUploadResumeMutation>;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const STUB_JOB: ResumeUploadJob = {
  id: "job-1",
  profile_id: "profile-1",
  file_filename: "my_resume.pdf",
  file_content_type: "application/pdf",
  file_size_bytes: 12345,
  status: "queued",
  error_message: null,
  started_at: null,
  completed_at: null,
  created_at: "2026-05-04T12:00:00Z",
  updated_at: "2026-05-04T12:00:00Z",
};

function setupDefaultMocks() {
  mockUseListResumeJobs.mockReturnValue({
    data: [],
    isLoading: false,
  } as unknown as ReturnType<typeof useListResumeJobsQuery>);
  mockUseUploadResume.mockReturnValue(stubMutation);
  mockUseGetDownloadUrl.mockReturnValue({
    data: undefined,
    isLoading: false,
  } as unknown as ReturnType<typeof useGetResumeDownloadUrlQuery>);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("ResumeUploadSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResumeJobRow.mockReturnValue(false as unknown as ReturnType<typeof ResumeJobRow>);
    mockResumeUploadSectionSkeleton.mockReturnValue(false as unknown as ReturnType<typeof ResumeUploadSectionSkeleton>);
  });

  it("renders the section heading", () => {
    setupDefaultMocks();
    render(<ResumeUploadSection profileId="profile-1" />);
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("renders empty state when no jobs exist", () => {
    setupDefaultMocks();
    render(<ResumeUploadSection profileId="profile-1" />);
    expect(screen.getByText(/No resumes uploaded yet/i)).toBeInTheDocument();
  });

  it("renders a ResumeJobRow for each job in the list", () => {
    mockUseListResumeJobs.mockReturnValue({
      data: [STUB_JOB],
      isLoading: false,
    } as unknown as ReturnType<typeof useListResumeJobsQuery>);
    mockUseUploadResume.mockReturnValue(stubMutation);
    mockUseGetDownloadUrl.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetResumeDownloadUrlQuery>);

    render(<ResumeUploadSection profileId="profile-1" />);

    expect(mockResumeJobRow).toHaveBeenCalledWith(
      expect.objectContaining({ job: STUB_JOB }),
      expect.anything(),
    );
  });

  it("calls the upload mutation with FormData when a file is selected", async () => {
    const uploadTrigger = vi.fn().mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(STUB_JOB),
    });
    setupDefaultMocks();
    mockUseUploadResume.mockReturnValue(
      [uploadTrigger, { isLoading: false }] as unknown as ReturnType<typeof useUploadResumeMutation>,
    );

    render(<ResumeUploadSection profileId="profile-1" />);

    const fileInput = screen.getByTestId("file-input");
    const fakeFile = new File(["%PDF-1.4 test"], "resume.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, fakeFile);

    await waitFor(() => {
      expect(uploadTrigger).toHaveBeenCalledOnce();
    });

    const [calledWith] = uploadTrigger.mock.calls[0] as [FormData];
    expect(calledWith).toBeInstanceOf(FormData);
    expect(calledWith.get("file")).toBe(fakeFile);
  });

  it("shows a success toast after a successful upload", async () => {
    const uploadTrigger = vi.fn().mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(STUB_JOB),
    });
    setupDefaultMocks();
    mockUseUploadResume.mockReturnValue(
      [uploadTrigger, { isLoading: false }] as unknown as ReturnType<typeof useUploadResumeMutation>,
    );

    render(<ResumeUploadSection profileId="profile-1" />);

    const fileInput = screen.getByTestId("file-input");
    const fakeFile = new File(["%PDF-1.4 test"], "resume.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, fakeFile);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        expect.stringContaining("resume.pdf"),
      );
    });
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it("shows an error toast when the upload fails", async () => {
    const uploadTrigger = vi.fn().mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error("413 Payload Too Large")),
    });
    setupDefaultMocks();
    mockUseUploadResume.mockReturnValue(
      [uploadTrigger, { isLoading: false }] as unknown as ReturnType<typeof useUploadResumeMutation>,
    );

    render(<ResumeUploadSection profileId="profile-1" />);

    const fileInput = screen.getByTestId("file-input");
    const fakeFile = new File(["%PDF-1.4 test"], "resume.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, fakeFile);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it("renders the skeleton while the job list is loading", () => {
    mockUseListResumeJobs.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useListResumeJobsQuery>);
    mockUseUploadResume.mockReturnValue(stubMutation);
    mockUseGetDownloadUrl.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetResumeDownloadUrlQuery>);

    render(<ResumeUploadSection profileId="profile-1" />);

    expect(mockResumeUploadSectionSkeleton).toHaveBeenCalled();
    expect(screen.queryByText(/No resumes uploaded yet/i)).not.toBeInTheDocument();
  });
});
