/**
 * Behavior tests for LeaseAttachmentRow when the underlying storage
 * object is missing (NoSuchKey). The backend response builder flips
 * `is_available=false` and clears `presigned_url`; the row should
 * render a "File missing" alert with a "Re-upload" button instead of
 * the normal Open / Download links.
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

describe("LeaseAttachmentRow — missing file UX", () => {
  beforeEach(() => {
    updateMock.mockReset();
    deleteMock.mockReset();
    uploadMock.mockReset();
  });

  it("renders the 'File missing' alert and re-upload button when is_available=false", () => {
    renderSection(ORPHAN_ATTACHMENT);
    expect(
      screen.getByTestId(`lease-attachment-missing-${ORPHAN_ATTACHMENT.id}`),
    ).toHaveTextContent(/File missing/i);
    expect(
      screen.getByTestId(`lease-attachment-reupload-${ORPHAN_ATTACHMENT.id}`),
    ).toBeInTheDocument();
  });

  it("hides the preview button and download link when is_available=false", () => {
    renderSection(ORPHAN_ATTACHMENT);
    expect(
      screen.queryByTestId(`lease-attachment-preview-${ORPHAN_ATTACHMENT.id}`),
    ).toBeNull();
    expect(
      screen.queryByTestId(`lease-attachment-download-${ORPHAN_ATTACHMENT.id}`),
    ).toBeNull();
  });

  it("hides the re-upload button when canWrite=false", () => {
    renderSection(ORPHAN_ATTACHMENT, false);
    expect(
      screen.queryByTestId(`lease-attachment-reupload-${ORPHAN_ATTACHMENT.id}`),
    ).toBeNull();
    // The 'File missing' message itself remains so the user understands
    // why they can't open the file.
    expect(
      screen.getByTestId(`lease-attachment-missing-${ORPHAN_ATTACHMENT.id}`),
    ).toBeInTheDocument();
  });

  it("re-upload triggers DELETE then POST with the same kind", async () => {
    deleteMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    uploadMock.mockReturnValue({
      unwrap: () =>
        Promise.resolve({ ...ORPHAN_ATTACHMENT, id: "att-new", is_available: true }),
    });

    renderSection(ORPHAN_ATTACHMENT);

    const reuploadButton = screen.getByTestId(
      `lease-attachment-reupload-${ORPHAN_ATTACHMENT.id}`,
    );
    // The hidden file input is sibling to the button. Find via container.
    const li = reuploadButton.closest("li") as HTMLElement;
    const fileInput = li.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

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

  it("does not call DELETE when re-upload picks an unsupported file type", () => {
    renderSection(ORPHAN_ATTACHMENT);

    const reuploadButton = screen.getByTestId(
      `lease-attachment-reupload-${ORPHAN_ATTACHMENT.id}`,
    );
    const li = reuploadButton.closest("li") as HTMLElement;
    const fileInput = li.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(["nope"], "shady.exe", {
      type: "application/x-msdownload",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(deleteMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
