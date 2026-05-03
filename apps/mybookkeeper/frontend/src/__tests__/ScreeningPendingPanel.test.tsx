import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreeningPendingPanel from "@/app/features/screening/ScreeningPendingPanel";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";

function makePendingResult(overrides: Partial<ScreeningResult> = {}): ScreeningResult {
  return {
    id: "result-pending-1",
    applicant_id: "app-1",
    provider: "keycheck",
    status: "pending",
    report_storage_key: null,
    adverse_action_snippet: null,
    notes: null,
    requested_at: "2026-05-01T10:00:00Z",
    completed_at: null,
    uploaded_at: "2026-05-01T10:00:00Z",
    uploaded_by_user_id: "user-1",
    created_at: "2026-05-01T10:00:00Z",
    presigned_url: null,
    ...overrides,
  };
}

describe("ScreeningPendingPanel", () => {
  it("renders the pending panel container", () => {
    render(
      <ScreeningPendingPanel
        pendingResult={makePendingResult()}
        onUploadClick={vi.fn()}
        canWrite
      />,
    );
    expect(screen.getByTestId("screening-pending-panel")).toBeInTheDocument();
  });

  it("shows the 'waiting for results' heading", () => {
    render(
      <ScreeningPendingPanel
        pendingResult={makePendingResult()}
        onUploadClick={vi.fn()}
        canWrite
      />,
    );
    expect(screen.getByText(/Running background check — waiting for results/i)).toBeInTheDocument();
  });

  it("shows the provider name in the status text", () => {
    render(
      <ScreeningPendingPanel
        pendingResult={makePendingResult({ provider: "rentspree" })}
        onUploadClick={vi.fn()}
        canWrite
      />,
    );
    expect(screen.getByText(/rentspree/i)).toBeInTheDocument();
  });

  it("shows the upload button when canWrite is true", () => {
    render(
      <ScreeningPendingPanel
        pendingResult={makePendingResult()}
        onUploadClick={vi.fn()}
        canWrite
      />,
    );
    expect(screen.getByTestId("screening-pending-upload-button")).toBeInTheDocument();
  });

  it("hides the upload button when canWrite is false", () => {
    render(
      <ScreeningPendingPanel
        pendingResult={makePendingResult()}
        onUploadClick={vi.fn()}
        canWrite={false}
      />,
    );
    expect(screen.queryByTestId("screening-pending-upload-button")).not.toBeInTheDocument();
  });

  it("calls onUploadClick when the upload button is clicked", async () => {
    const onUploadClick = vi.fn();
    render(
      <ScreeningPendingPanel
        pendingResult={makePendingResult()}
        onUploadClick={onUploadClick}
        canWrite
      />,
    );
    await userEvent.click(screen.getByTestId("screening-pending-upload-button"));
    expect(onUploadClick).toHaveBeenCalledOnce();
  });
});
