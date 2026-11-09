/**
 * Unit tests for:
 * - LeaseAttachmentsSection kind picker: change calls updateLeaseAttachment mutation
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import LeaseAttachmentsSection from "@/app/features/leases/LeaseAttachmentsSection";
import { showError } from "@platform/ui";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";

// ---------------------------------------------------------------------------
// LeaseAttachmentsSection — kind picker calls mutation
// ---------------------------------------------------------------------------

const updateMock = vi.fn();
const deleteMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("@mybookkeeper/api-client/store/signedLeasesApi", () => ({
  useUploadSignedLeaseAttachmentMutation: () => [uploadMock, { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [deleteMock, {}],
  useUpdateLeaseAttachmentMutation: () => [updateMock, {}],
}));

// Suppress toast errors in tests.
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const ATTACHMENT: SignedLeaseAttachment = {
  id: "att-1",
  lease_id: "lease-1",
  filename: "lease.pdf",
  storage_key: "signed-leases/lease-1/att-1",
  content_type: "application/pdf",
  size_bytes: 1024,
  kind: "signed_addendum",
  uploaded_by_user_id: "user-1",
  uploaded_at: "2026-05-01T10:00:00Z",
  presigned_url: "https://storage.example.com/presigned/lease.pdf",
  is_available: true,
};

describe("LeaseAttachmentsSection — kind picker", () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve({ ...ATTACHMENT, kind: "signed_lease" }) });
  });

  function renderSection() {
    return render(
      <Provider store={store}>
        <LeaseAttachmentsSection
          leaseId="lease-1"
          attachments={[ATTACHMENT]}
          canWrite
        />
      </Provider>,
    );
  }

  it("shows the current kind in the dropdown", () => {
    renderSection();
    const picker = screen.getByTestId(`lease-attachment-kind-picker-${ATTACHMENT.id}`);
    expect((picker as HTMLSelectElement).value).toBe("signed_addendum");
  });

  it("calls updateLeaseAttachment when kind changes", async () => {
    renderSection();
    const picker = screen.getByTestId(`lease-attachment-kind-picker-${ATTACHMENT.id}`);
    fireEvent.change(picker, { target: { value: "signed_lease" } });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        leaseId: "lease-1",
        attachmentId: ATTACHMENT.id,
        kind: "signed_lease",
      });
    });
  });

  it("makes the filename clickable for previewable content types", () => {
    renderSection();
    const previewButton = screen.getByTestId(`lease-attachment-preview-${ATTACHMENT.id}`);
    expect(previewButton).toBeInTheDocument();
  });

  it("hides the kind picker when canWrite is false", () => {
    render(
      <Provider store={store}>
        <LeaseAttachmentsSection
          leaseId="lease-1"
          attachments={[ATTACHMENT]}
          canWrite={false}
        />
      </Provider>,
    );
    expect(screen.queryByTestId(`lease-attachment-kind-picker-${ATTACHMENT.id}`)).toBeNull();
  });
});

describe("LeaseAttachmentsSection — delete", () => {
  it("explains why an extension's addendum can't change kind", async () => {
    updateMock.mockReset();
    updateMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 409, data: { detail: { code: "ATTACHMENT_BACKS_EXTENSION" } } }),
    });
    render(
      <Provider store={store}>
        <LeaseAttachmentsSection leaseId="lease-1" attachments={[ATTACHMENT]} canWrite />
      </Provider>,
    );
    fireEvent.change(screen.getByTestId(`lease-attachment-kind-picker-${ATTACHMENT.id}`), {
      target: { value: "notice" },
    });
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "This addendum is the record of an extension. Undo the extension to change it.",
      );
    });
  });

  it("explains why an extension's addendum can't go, and closes the question", async () => {
    deleteMock.mockReset();
    deleteMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 409, data: { detail: { code: "ATTACHMENT_BACKS_EXTENSION" } } }),
    });
    render(
      <Provider store={store}>
        <LeaseAttachmentsSection leaseId="lease-1" attachments={[ATTACHMENT]} canWrite />
      </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: `Delete ${ATTACHMENT.filename}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "This addendum is the record of an extension. Undo the extension to remove it.",
      );
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove" })).toBeNull());
  });
});
