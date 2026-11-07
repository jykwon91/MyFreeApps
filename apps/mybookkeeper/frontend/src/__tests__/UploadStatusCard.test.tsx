import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import UploadStatusCard from "@/app/features/documents/UploadStatusCard";
import { FILE_STATUSES } from "@/shared/types/document/file-status";
import { BATCH_STATUSES } from "@mybookkeeper/api-client/types/document/BatchStatus";
import type { UploadState } from "@/shared/types/document/upload-state";

const batchUpload: UploadState = {
  fileName: "3 files",
  status: FILE_STATUSES.PROCESSING,
  documentId: "doc-1",
  batchId: "batch-1",
  batchTotal: 4,
  batchFailed: 0,
  multiUploadTotal: 0,
  multiUploadCompleted: 0,
  multiUploadFailed: 0,
};

const batchStatus = { batch_id: "batch-1", total: 4, completed: 1, failed: 0, status: BATCH_STATUSES.PROCESSING };

describe("UploadStatusCard", () => {
  it("renders nothing when there is no upload", () => {
    const { container } = render(
      <UploadStatusCard upload={null} statusText={null} batchStatus={undefined} onCancelBatch={vi.fn()} isCancellingBatch={false} onDismiss={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows how much of a batch has been read and cancels that batch", () => {
    const onCancelBatch = vi.fn();
    render(
      <UploadStatusCard upload={batchUpload} statusText="3 files — 1 of 4 extracted…" batchStatus={batchStatus} onCancelBatch={onCancelBatch} isCancellingBatch={false} onDismiss={vi.fn()} />,
    );
    const bar = screen.getByRole("progressbar", { name: "1 of 4 files read" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelBatch).toHaveBeenCalledWith("batch-1");
    expect(screen.queryByTitle("Dismiss")).not.toBeInTheDocument();
  });

  it("shows a failed read in red and lets it be dismissed", () => {
    const onDismiss = vi.fn();
    render(
      <UploadStatusCard
        upload={{ ...batchUpload, batchId: null, status: FILE_STATUSES.FAILED }}
        statusText="a.pdf — I had trouble reading this one."
        batchStatus={undefined}
        onCancelBatch={vi.fn()}
        isCancellingBatch={false}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/I had trouble reading this one/)).toHaveClass("text-destructive");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("warns, rather than showing a plain success, when some of a finished batch failed", () => {
    render(
      <UploadStatusCard upload={{ ...batchUpload, status: FILE_STATUSES.DONE, batchFailed: 1 }} statusText="3 files — 3 of 4 documents processed (1 failed)" batchStatus={undefined} onCancelBatch={vi.fn()} isCancellingBatch={false} onDismiss={vi.fn()} />,
    );
    expect(screen.getByLabelText("Some files failed")).toBeInTheDocument();
  });

  it("shows no warning when a finished batch had no failures", () => {
    render(
      <UploadStatusCard upload={{ ...batchUpload, status: FILE_STATUSES.DONE }} statusText="3 files — 4 documents processed" batchStatus={undefined} onCancelBatch={vi.fn()} isCancellingBatch={false} onDismiss={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Some files failed")).not.toBeInTheDocument();
  });

  it("shows the cancel as in progress and blocks a second click while it runs", () => {
    const onCancelBatch = vi.fn();
    render(
      <UploadStatusCard upload={batchUpload} statusText="3 files — 1 of 4 extracted…" batchStatus={batchStatus} onCancelBatch={onCancelBatch} isCancellingBatch onDismiss={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: /Cancelling…/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCancelBatch).not.toHaveBeenCalled();
  });
});
