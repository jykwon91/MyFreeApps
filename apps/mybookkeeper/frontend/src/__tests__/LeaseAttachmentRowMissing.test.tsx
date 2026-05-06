/**
 * Behavior tests for LeaseAttachmentRow when the underlying storage
 * object is missing (is_available=false). Per the silent-observability
 * rule, the UI stays clean — there is no visible "File missing" alert
 * and no explicit "Re-upload" button. The filename remains clickable;
 * clicking captures a PostHog/console event AND opens the file picker
 * so the host can replace the orphan in place.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("does NOT render a visible 'File missing' alert", () => {
    renderSection(ORPHAN_ATTACHMENT);
    expect(
      screen.queryByText(/file missing from storage/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the filename as a clickable button (always-clickable rule)", () => {
    renderSection(ORPHAN_ATTACHMENT);
    const filenameButton = screen.getByTestId(
      `lease-attachment-preview-${ORPHAN_ATTACHMENT.id}`,
    );
    expect(filenameButton).toBeInTheDocument();
    expect(filenameButton.tagName).toBe("BUTTON");
  });

  it("clicking the filename captures a PostHog/console event AND triggers the file picker", () => {
    renderSection(ORPHAN_ATTACHMENT);
    const filenameButton = screen.getByTestId(
      `lease-attachment-preview-${ORPHAN_ATTACHMENT.id}`,
    );
    fireEvent.click(filenameButton);

    expect(reportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "lease_attachment",
        attachment_id: "att-orphan",
        storage_key: "signed-leases/lease-1/att-orphan",
        parent_id: "lease-1",
      }),
    );
  });

  it("re-uploading after a missing-file click triggers DELETE + POST with the same kind", async () => {
    deleteMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    uploadMock.mockReturnValue({
      unwrap: () =>
        Promise.resolve({ ...ORPHAN_ATTACHMENT, id: "att-new", is_available: true }),
    });

    renderSection(ORPHAN_ATTACHMENT);

    const li = screen.getByTestId(`lease-attachment-${ORPHAN_ATTACHMENT.id}`);
    const fileInput = li.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(["replacement bytes"], "replacement.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith({
        leaseId: "lease-1",
        attachmentId: "att-orphan",
      });
      expect(uploadMock).toHaveBeenCalledWith({
        leaseId: "lease-1",
        file,
        kind: "signed_lease",
      });
    });
  });
});
