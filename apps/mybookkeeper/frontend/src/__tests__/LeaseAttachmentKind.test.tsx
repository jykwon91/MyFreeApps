/**
 * Unit tests for:
 * - inferKindFromFilename / inferKindsForFiles heuristics (frontend mirror of backend logic)
 * - LeaseAttachmentsSection kind picker: change calls updateLeaseAttachment mutation
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import { inferKindFromFilename, inferKindsForFiles } from "@/shared/lib/infer-attachment-kind";
import LeaseAttachmentsSection from "@/app/features/leases/LeaseAttachmentsSection";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

// ---------------------------------------------------------------------------
// inferKindFromFilename unit tests
// ---------------------------------------------------------------------------

describe("inferKindFromFilename", () => {
  it("returns move_in_inspection for 'move-in inspection'", () => {
    expect(inferKindFromFilename("Move-In Inspection.pdf")).toBe("move_in_inspection");
  });

  it("returns move_in_inspection for 'move in inspection'", () => {
    expect(inferKindFromFilename("move in inspection.pdf")).toBe("move_in_inspection");
  });

  it("returns move_out_inspection for 'move-out inspection'", () => {
    expect(inferKindFromFilename("Move-Out Inspection.pdf")).toBe("move_out_inspection");
  });

  it("returns signed_lease for 'lease agreement'", () => {
    expect(inferKindFromFilename("Lease Agreement.pdf")).toBe("signed_lease");
  });

  it("returns signed_lease for 'rental agreement'", () => {
    expect(inferKindFromFilename("Rental Agreement.pdf")).toBe("signed_lease");
  });

  it("returns move_in_inspection for generic 'inspection'", () => {
    expect(inferKindFromFilename("Property Inspection.pdf")).toBe("move_in_inspection");
  });

  it("returns insurance_proof for 'insurance'", () => {
    expect(inferKindFromFilename("Tenant Insurance.pdf")).toBe("insurance_proof");
  });

  it("returns signed_addendum for unknown filename", () => {
    expect(inferKindFromFilename("House Rules.pdf")).toBe("signed_addendum");
  });
});

describe("inferKindsForFiles", () => {
  it("promotes first file to signed_lease if none match", () => {
    const kinds = inferKindsForFiles(["House Rules.pdf", "Pet Disclosure.pdf"]);
    expect(kinds[0]).toBe("signed_lease");
    expect(kinds[1]).toBe("signed_addendum");
  });

  it("does not promote if signed_lease already detected", () => {
    const kinds = inferKindsForFiles(["Lease Agreement.pdf", "House Rules.pdf"]);
    expect(kinds).toEqual(["signed_lease", "signed_addendum"]);
  });

  it("returns empty array for empty input", () => {
    expect(inferKindsForFiles([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LeaseAttachmentsSection — kind picker calls mutation
// ---------------------------------------------------------------------------

const updateMock = vi.fn();
const deleteMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useUploadSignedLeaseAttachmentMutation: () => [uploadMock, { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [deleteMock, {}],
  useUpdateLeaseAttachmentMutation: () => [updateMock, {}],
}));

// Suppress toast errors in tests.
vi.mock("@/shared/lib/toast-store", () => ({
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
