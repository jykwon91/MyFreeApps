/**
 * Unit tests for ResumeJobRow.
 *
 * Covers:
 *   - queued status renders "Queued" gray badge
 *   - processing status renders "Processing" yellow badge
 *   - complete status renders "Complete" green badge + expand button
 *   - failed status renders "Failed" red badge + error message
 *   - cancelled status renders "Cancelled" gray badge
 *   - complete + expanded shows parsed fields panel
 *   - complete without result_parsed_fields shows no expand button
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ResumeUploadJob } from "@/types/resume-upload-job/resume-upload-job";

// ---------------------------------------------------------------------------
// Mock child components and @platform/ui to avoid deep render.
// ---------------------------------------------------------------------------

vi.mock("@/features/profile/ResumeJobParsedPanel", () => ({
  default: vi.fn(({ parsed }: { parsed: { headline: string | null } }) => (
    <div data-testid="parsed-panel">{parsed.headline ?? "no headline"}</div>
  )),
}));

vi.mock("@platform/ui", () => ({
  Badge: ({ label, color }: { label: string; color: string }) => (
    <span data-testid="badge" data-color={color}>{label}</span>
  ),
  // The component reads formatFileSize for the size suffix; identity
  // string is fine here — the test asserts behavior, not formatting.
  formatFileSize: (bytes: number) => `${bytes} bytes`,
}));

vi.mock("lucide-react", () => ({
  Download: () => <svg data-testid="download-icon" />,
  FileText: () => <svg data-testid="file-icon" />,
  ChevronDown: () => <svg data-testid="chevron-down" />,
  ChevronUp: () => <svg data-testid="chevron-up" />,
}));

// ---------------------------------------------------------------------------
// Import under test — AFTER all vi.mock calls.
// ---------------------------------------------------------------------------

import ResumeJobRow from "@/features/profile/ResumeJobRow";

// ---------------------------------------------------------------------------
// Shared test data builder
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<ResumeUploadJob> = {}): ResumeUploadJob {
  return {
    id: "job-abc",
    profile_id: "profile-1",
    file_filename: "my_resume.pdf",
    file_content_type: "application/pdf",
    file_size_bytes: 12345,
    status: "queued",
    error_message: null,
    result_parsed_fields: null,
    parser_version: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-05-04T12:00:00Z",
    updated_at: "2026-05-04T12:00:00Z",
    ...overrides,
  };
}

const NOOP_DOWNLOAD = vi.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ResumeJobRow — status badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Queued' badge in gray for queued status", () => {
    render(<ResumeJobRow job={makeJob({ status: "queued" })} onDownload={NOOP_DOWNLOAD} isDownloading={false} />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("Queued");
    expect(badge).toHaveAttribute("data-color", "gray");
  });

  it("renders 'Processing' badge in yellow for processing status", () => {
    render(<ResumeJobRow job={makeJob({ status: "processing" })} onDownload={NOOP_DOWNLOAD} isDownloading={false} />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("Processing");
    expect(badge).toHaveAttribute("data-color", "yellow");
  });

  it("renders 'Complete' badge in green for complete status", () => {
    render(
      <ResumeJobRow
        job={makeJob({ status: "complete", result_parsed_fields: { summary: null, headline: null, work_history_count: 1, education_count: 1, skills_count: 5 } })}
        onDownload={NOOP_DOWNLOAD}
        isDownloading={false}
      />,
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("Complete");
    expect(badge).toHaveAttribute("data-color", "green");
  });

  it("renders 'Failed' badge in red for failed status", () => {
    render(
      <ResumeJobRow
        job={makeJob({ status: "failed", error_message: "Could not extract text" })}
        onDownload={NOOP_DOWNLOAD}
        isDownloading={false}
      />,
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("Failed");
    expect(badge).toHaveAttribute("data-color", "red");
  });

  it("renders 'Cancelled' badge in gray for cancelled status", () => {
    render(<ResumeJobRow job={makeJob({ status: "cancelled" })} onDownload={NOOP_DOWNLOAD} isDownloading={false} />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("Cancelled");
    expect(badge).toHaveAttribute("data-color", "gray");
  });

  it("shows error message text for failed status", () => {
    render(
      <ResumeJobRow
        job={makeJob({ status: "failed", error_message: "no extractable text" })}
        onDownload={NOOP_DOWNLOAD}
        isDownloading={false}
      />,
    );
    expect(screen.getByText("no extractable text")).toBeInTheDocument();
  });
});

describe("ResumeJobRow — complete status expand/collapse", () => {
  const PARSED_FIELDS = {
    summary: "Experienced engineer",
    headline: "Senior Software Engineer",
    work_history_count: 3,
    education_count: 1,
    skills_count: 10,
  };

  it("shows expand button when status is complete with result_parsed_fields", () => {
    render(
      <ResumeJobRow
        job={makeJob({ status: "complete", result_parsed_fields: PARSED_FIELDS })}
        onDownload={NOOP_DOWNLOAD}
        isDownloading={false}
      />,
    );
    expect(screen.getByTitle("Show parsed results")).toBeInTheDocument();
  });

  it("does not show expand button when complete but no result_parsed_fields", () => {
    render(
      <ResumeJobRow
        job={makeJob({ status: "complete", result_parsed_fields: null })}
        onDownload={NOOP_DOWNLOAD}
        isDownloading={false}
      />,
    );
    expect(screen.queryByTitle("Show parsed results")).not.toBeInTheDocument();
  });

  it("renders parsed panel when expand button is clicked", () => {
    render(
      <ResumeJobRow
        job={makeJob({ status: "complete", result_parsed_fields: PARSED_FIELDS })}
        onDownload={NOOP_DOWNLOAD}
        isDownloading={false}
      />,
    );
    expect(screen.queryByTestId("parsed-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Show parsed results"));

    expect(screen.getByTestId("parsed-panel")).toBeInTheDocument();
  });

  it("collapses the panel when expand button is clicked again", () => {
    render(
      <ResumeJobRow
        job={makeJob({ status: "complete", result_parsed_fields: PARSED_FIELDS })}
        onDownload={NOOP_DOWNLOAD}
        isDownloading={false}
      />,
    );
    fireEvent.click(screen.getByTitle("Show parsed results"));
    expect(screen.getByTestId("parsed-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Hide parsed results"));
    expect(screen.queryByTestId("parsed-panel")).not.toBeInTheDocument();
  });

  it("does not show expand button for queued, processing, or failed statuses", () => {
    const statuses = ["queued", "processing", "failed"] as const;
    for (const status of statuses) {
      const { unmount } = render(
        <ResumeJobRow
          job={makeJob({ status, error_message: status === "failed" ? "err" : null })}
          onDownload={NOOP_DOWNLOAD}
          isDownloading={false}
        />,
      );
      expect(screen.queryByTitle("Show parsed results")).not.toBeInTheDocument();
      unmount();
    }
  });
});
