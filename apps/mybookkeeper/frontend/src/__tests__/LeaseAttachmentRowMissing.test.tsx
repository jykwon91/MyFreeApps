/**
 * Behavior tests for LeaseAttachmentRow when the underlying storage
 * object is missing (is_available=false).
 *
 * Click on filename = view document (always). Missing rows fire an
 * observability event on render; the click itself is the standard
 * preview/download — no UI hijacking, no re-upload picker, no
 * destructive alerts.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import LeaseAttachmentsSection from "@/app/features/leases/LeaseAttachmentsSection";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

const updateMock = vi.fn();
const deleteMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useUploadSignedLeaseAttachmentMutation: () => [uploadMock, { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [deleteMock, {}],
  useUpdateLeaseAttachmentMutation: () => [updateMock, {}],
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const reportMock = vi.fn();
vi.mock("@/shared/lib/storage-observability", () => ({
  reportMissingStorageObject: (...args: unknown[]) => reportMock(...args),
}));

const ORPHAN_ATTACHMENT: SignedLeaseAttachment = {
  id: "att-orphan",
  lease_id: "lease-1",
  filename: "1 - Lease Agreement.pdf",
  storage_key: "signed-leases/lease-1/att-orphan",
  content_type: "application/pdf",
  size_bytes: 1024,
  kind: "signed_lease",
  uploaded_by_user_id: "user-1",
  uploaded_at: "2026-05-01T10:00:00Z",
  presigned_url: null,
  is_available: false,
};

function renderSection(att: SignedLeaseAttachment, canWrite = true) {
  return render(
    <Provider store={store}>
      <LeaseAttachmentsSection
        leaseId="lease-1"
        attachments={[att]}
        canWrite={canWrite}
      />
    </Provider>,
  );
}

describe("LeaseAttachmentRow — missing file (silent UX)", () => {
  beforeEach(() => {
    updateMock.mockReset();
    deleteMock.mockReset();
    uploadMock.mockReset();
    reportMock.mockReset();
  });

  it("does NOT render any visible 'File missing' alert", () => {
    renderSection(ORPHAN_ATTACHMENT);
    expect(
      screen.queryByText(/file missing from storage/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does NOT render a re-upload button", () => {
    renderSection(ORPHAN_ATTACHMENT);
    const li = screen.getByTestId(`lease-attachment-${ORPHAN_ATTACHMENT.id}`);
    const reuploadBtn = li.querySelector(
      "[data-testid$='-reupload'], [data-testid*='reupload-trigger']",
    );
    expect(reuploadBtn).toBeNull();
  });

  it("captures the missing-storage event on render via PostHog/console", () => {
    renderSection(ORPHAN_ATTACHMENT);
    expect(reportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "lease_attachment",
        attachment_id: "att-orphan",
        storage_key: "signed-leases/lease-1/att-orphan",
        parent_id: "lease-1",
      }),
    );
  });

  it("does not call DELETE or upload mutations on render of a missing row", () => {
    renderSection(ORPHAN_ATTACHMENT);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("renders the filename as a clickable element (no plain text)", () => {
    renderSection(ORPHAN_ATTACHMENT);
    const li = screen.getByTestId(`lease-attachment-${ORPHAN_ATTACHMENT.id}`);
    const linkOrBtn = li.querySelector(
      `[data-testid='lease-attachment-download-link-${ORPHAN_ATTACHMENT.id}'], `
      + `[data-testid='lease-attachment-preview-${ORPHAN_ATTACHMENT.id}']`,
    );
    expect(linkOrBtn).not.toBeNull();
  });
});
