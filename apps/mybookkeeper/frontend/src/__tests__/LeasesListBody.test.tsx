/**
 * Unit tests for LeasesListBody — covers the delete affordance and the
 * quick-upload affordance added in feat(leases): upload from list.
 *
 * Coverage:
 * - Delete button absent when canWrite is false
 * - Delete button present when canWrite is true
 * - Clicking delete button opens the ConfirmDialog
 * - Confirming calls onDelete with the correct lease
 * - Cancelling closes the dialog without calling onDelete
 * - Upload button absent when canWrite is false
 * - Upload button present when canWrite is true
 * - Clicking upload button opens the quick-upload modal for the correct lease
 * - Closing the modal removes it from the DOM
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LeasesListBody from "@/app/features/leases/LeasesListBody";
import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";

// ---------------------------------------------------------------------------
// Mocks — the quick-upload modal renders LeaseAttachmentDropzone which needs
// the upload mutation; stub the whole API module to keep this test focused.
// ---------------------------------------------------------------------------

const mockUpload = vi.fn();
vi.mock("@/shared/store/signedLeasesApi", () => ({
  useUploadSignedLeaseAttachmentMutation: () => [mockUpload, { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [vi.fn(), {}],
  useUpdateLeaseAttachmentMutation: () => [vi.fn(), {}],
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEASE_A: SignedLeaseSummary = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  user_id: "u1",
  organization_id: "org-1",
  template_ids: [],
  applicant_id: "app-1",
  listing_id: null,
  kind: "generated",
  status: "draft",
  starts_on: "2026-06-01",
  ends_on: "2027-05-31",
  generated_at: "2026-05-01T10:00:00Z",
  signed_at: null,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  applicant_legal_name: "Andrew Le",
};

const LEASE_B: SignedLeaseSummary = {
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  user_id: "u1",
  organization_id: "org-1",
  template_ids: [],
  applicant_id: "app-1",
  listing_id: null,
  kind: "imported",
  status: "signed",
  starts_on: "2025-01-01",
  ends_on: "2025-12-31",
  generated_at: null,
  signed_at: "2025-01-05T00:00:00Z",
  created_at: "2025-01-05T00:00:00Z",
  updated_at: "2025-01-05T00:00:00Z",
  applicant_legal_name: "Andrew Le",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderList({
  leases = [LEASE_A, LEASE_B],
  canWrite = false,
  onDelete = vi.fn(),
  isDeleting = false,
}: {
  leases?: SignedLeaseSummary[];
  canWrite?: boolean;
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
} = {}) {
  return render(
    <MemoryRouter>
      <LeasesListBody
        mode="list"
        leases={leases}
        canWrite={canWrite}
        onDelete={onDelete}
        isDeleting={isDeleting}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LeasesListBody — delete affordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders both lease rows in the table", () => {
    renderList({ canWrite: true });
    expect(screen.getByTestId(`lease-row-${LEASE_A.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lease-row-${LEASE_B.id}`)).toBeInTheDocument();
  });

  it("hides delete buttons when canWrite is false", () => {
    renderList({ canWrite: false });
    expect(screen.queryByTestId(`lease-delete-btn-${LEASE_A.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`lease-delete-btn-${LEASE_B.id}`)).not.toBeInTheDocument();
  });

  it("shows delete buttons when canWrite is true", () => {
    renderList({ canWrite: true });
    expect(screen.getByTestId(`lease-delete-btn-${LEASE_A.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lease-delete-btn-${LEASE_B.id}`)).toBeInTheDocument();
  });

  it("opens the confirmation dialog when delete button is clicked", async () => {
    renderList({ canWrite: true });

    await userEvent.click(screen.getByTestId(`lease-delete-btn-${LEASE_A.id}`));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete this lease/i)).toBeInTheDocument();
    expect(screen.getByText(/permanently remove Lease aaaaaaaa/i)).toBeInTheDocument();
  });

  it("calls onDelete with the correct lease when confirmed", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderList({ canWrite: true, onDelete });

    await userEvent.click(screen.getByTestId(`lease-delete-btn-${LEASE_A.id}`));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(LEASE_A);
    });
  });

  it("closes the dialog without calling onDelete when cancelled", async () => {
    const onDelete = vi.fn();
    renderList({ canWrite: true, onDelete });

    await userEvent.click(screen.getByTestId(`lease-delete-btn-${LEASE_B.id}`));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows loading state on the confirm button while deleting", () => {
    const onDelete = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <LeasesListBody
          mode="list"
          leases={[LEASE_A]}
          canWrite
          onDelete={onDelete}
          isDeleting={false}
        />
      </MemoryRouter>,
    );

    screen.getByTestId(`lease-delete-btn-${LEASE_A.id}`).click();

    rerender(
      <MemoryRouter>
        <LeasesListBody
          mode="list"
          leases={[LEASE_A]}
          canWrite
          onDelete={onDelete}
          isDeleting
        />
      </MemoryRouter>,
    );

    const confirmBtn = screen.getByRole("button", { name: /processing/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("renders loading skeleton in loading mode", () => {
    render(
      <MemoryRouter>
        <LeasesListBody mode="loading" leases={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("leases-skeleton")).toBeInTheDocument();
  });

  it("renders empty state in empty mode", () => {
    render(
      <MemoryRouter>
        <LeasesListBody mode="empty" leases={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no leases yet/i)).toBeInTheDocument();
  });
});

describe("LeasesListBody — upload affordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides upload buttons when canWrite is false", () => {
    renderList({ canWrite: false });
    expect(screen.queryByTestId(`lease-upload-btn-${LEASE_A.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`lease-upload-btn-${LEASE_B.id}`)).not.toBeInTheDocument();
  });

  it("shows upload buttons when canWrite is true", () => {
    renderList({ canWrite: true });
    expect(screen.getByTestId(`lease-upload-btn-${LEASE_A.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lease-upload-btn-${LEASE_B.id}`)).toBeInTheDocument();
  });

  it("opens the quick-upload modal when upload button is clicked", async () => {
    renderList({ canWrite: true });

    await userEvent.click(screen.getByTestId(`lease-upload-btn-${LEASE_A.id}`));

    expect(screen.getByTestId("lease-quick-upload-modal")).toBeInTheDocument();
    // Modal title includes the short ID
    expect(screen.getByText(/add documents to lease aaaaaaaa/i)).toBeInTheDocument();
  });

  it("opens the modal for the correct lease when second row upload is clicked", async () => {
    renderList({ canWrite: true });

    await userEvent.click(screen.getByTestId(`lease-upload-btn-${LEASE_B.id}`));

    expect(screen.getByTestId("lease-quick-upload-modal")).toBeInTheDocument();
    expect(screen.getByText(/add documents to lease bbbbbbbb/i)).toBeInTheDocument();
  });

  it("closes the upload modal when the close button is clicked", async () => {
    renderList({ canWrite: true });

    await userEvent.click(screen.getByTestId(`lease-upload-btn-${LEASE_A.id}`));
    expect(screen.getByTestId("lease-quick-upload-modal")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("lease-quick-upload-modal")).not.toBeInTheDocument();
    });
  });

  it("does not open both modals simultaneously", async () => {
    renderList({ canWrite: true });

    await userEvent.click(screen.getByTestId(`lease-upload-btn-${LEASE_A.id}`));
    expect(screen.getAllByTestId("lease-quick-upload-modal")).toHaveLength(1);
  });
});
