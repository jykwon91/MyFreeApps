/**
 * Unit tests for ``LeaseAddTemplateModal`` and the "Add template" button
 * visibility in ``LeaseDetail``.
 *
 * Covers:
 * - Button only visible when canWrite=true AND lease.kind="generated"
 * - Modal renders with available templates (excluding already-linked ones)
 * - "Add and generate" button is disabled when nothing selected
 * - Fires mutation with correct template_ids on confirm
 * - Shows success toast and closes modal on 200
 * - Shows 409-specific error toast on duplicate template conflict
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import LeaseDetail from "@/app/pages/LeaseDetail";
import type { SignedLeaseDetail } from "@/shared/types/lease/signed-lease-detail";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const addTemplatesMock = vi.fn();
const generateMock = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
const updateMock = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

let mockLease: SignedLeaseDetail | undefined;
const useGetSignedLeaseByIdQueryMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();
let canWriteValue = true;

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useGenerateSignedLeaseMutation: () => [generateMock, { isLoading: false }],
  useUpdateSignedLeaseMutation: () => [updateMock, { isLoading: false }],
  useEmailSignedLeaseToTenantMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve() })), { isLoading: false }],
  useUploadSignedLeaseAttachmentMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [vi.fn(), {}],
  useUpdateLeaseAttachmentMutation: () => [vi.fn(), {}],
  useGetSignedLeaseByIdQuery: (...args: unknown[]) =>
    useGetSignedLeaseByIdQueryMock(...args),
  useAddSignedLeaseTemplatesMutation: () => [addTemplatesMock, { isLoading: false }],
}));

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantByIdQuery: () => ({ data: undefined }),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (...args: unknown[]) => showErrorMock(...args),
  showSuccess: (...args: unknown[]) => showSuccessMock(...args),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => canWriteValue,
}));

const TEMPLATES: LeaseTemplateSummary[] = [
  {
    id: "tpl-existing",
    user_id: "user-1",
    organization_id: "org-1",
    name: "Master Lease",
    version: 1,
    description: null,
    placeholder_count: 3,
    file_count: 1,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
  {
    id: "tpl-new",
    user_id: "user-1",
    organization_id: "org-1",
    name: "Addendum",
    version: 2,
    description: "Pet addendum",
    placeholder_count: 1,
    file_count: 1,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
];

vi.mock("@/shared/store/leaseTemplatesApi", () => ({
  useGetLeaseTemplatesQuery: () => ({
    data: { items: TEMPLATES, total: 2 },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLease(overrides: Partial<SignedLeaseDetail> = {}): SignedLeaseDetail {
  return {
    id: "lease-1",
    user_id: "user-1",
    organization_id: "org-1",
    templates: [
      { id: "tpl-existing", name: "Master Lease", version: 1, display_order: 0 },
    ],
    applicant_id: "app-1",
    listing_id: null,
    kind: "generated",
    values: {},
    status: "generated",
    starts_on: null,
    ends_on: null,
    notes: null,
    generated_at: null,
    sent_at: null,
    signed_at: null,
    ended_at: null,
    auto_email_tenant: false,
    last_emailed_to_tenant_at: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    attachments: [],
    ...overrides,
  };
}

function renderDetail() {
  useGetSignedLeaseByIdQueryMock.mockReturnValue({
    data: mockLease,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/leases/lease-1"]}>
        <Routes>
          <Route path="/leases/:leaseId" element={<LeaseDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canWriteValue = true;
  addTemplatesMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

// ---------------------------------------------------------------------------
// Button visibility
// ---------------------------------------------------------------------------

describe("LeaseDetail — Add template button visibility", () => {
  it("shows the button on a generated lease when canWrite=true", () => {
    canWriteValue = true;
    mockLease = buildLease({ kind: "generated" });
    renderDetail();
    expect(screen.getByTestId("lease-add-template-button")).toBeInTheDocument();
  });

  it("hides the button on an imported lease", () => {
    canWriteValue = true;
    mockLease = buildLease({ kind: "imported", templates: [] });
    renderDetail();
    expect(screen.queryByTestId("lease-add-template-button")).toBeNull();
  });

  it("hides the button when canWrite=false", () => {
    canWriteValue = false;
    mockLease = buildLease({ kind: "generated" });
    renderDetail();
    expect(screen.queryByTestId("lease-add-template-button")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Modal behaviour
// ---------------------------------------------------------------------------

describe("LeaseAddTemplateModal", () => {
  it("opens when the 'Add template' button is clicked", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("lease-add-template-modal")).toBeInTheDocument(),
    );
  });

  it("only shows templates NOT already on the lease", async () => {
    canWriteValue = true;
    mockLease = buildLease(); // already has tpl-existing
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("lease-add-template-modal")).toBeInTheDocument(),
    );
    // tpl-new should appear, tpl-existing should NOT
    expect(screen.queryByTestId("add-template-option-tpl-existing")).toBeNull();
    expect(screen.getByTestId("add-template-option-tpl-new")).toBeInTheDocument();
  });

  it("'Add and generate' button is disabled when nothing selected", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("lease-add-template-confirm")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("lease-add-template-confirm")).toBeDisabled();
  });

  it("fires the mutation with correct template_ids on confirm", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() =>
      expect(addTemplatesMock).toHaveBeenCalledWith({
        leaseId: "lease-1",
        templateIds: ["tpl-new"],
      }),
    );
  });

  it("shows success toast and closes modal on successful add", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() => expect(showSuccessMock).toHaveBeenCalledWith("1 template added."));
    await waitFor(() =>
      expect(screen.queryByTestId("lease-add-template-modal")).toBeNull(),
    );
  });

  it("shows 409-specific error toast on duplicate conflict", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    addTemplatesMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 409 }),
    });
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() =>
      expect(showErrorMock).toHaveBeenCalledWith(
        "Some templates were already on this lease — pick different ones.",
      ),
    );
  });
});
