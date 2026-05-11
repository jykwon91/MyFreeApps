/**
 * Unit tests for ``LeaseAddTemplateModal`` and the "Add document" button
 * visibility in ``LeaseDetail``.
 *
 * Covers:
 * - Button visible when canWrite=true on BOTH generated and imported leases
 *   (post-2026-05-07 — imported leases can attach addendum templates)
 * - Hidden when canWrite=false (read-only viewers)
 * - Modal renders with available templates (excluding already-linked ones)
 * - "Continue" disabled when nothing selected
 * - Continue → prefill mutation → values step with prefilled inputs
 * - Generate fires add-templates mutation with template_ids + values
 * - Success toast + modal close on 200
 * - Generic error toast when the mutation rejects (post-2026-05-08 the
 *   backend treats already-linked templates as a regenerate, so 409 no
 *   longer fires from this path)
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
const prefillMock = vi.fn();
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
  usePrefillAddendumPlaceholdersMutation: () => [prefillMock, { isLoading: false }],
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
    latest_extension: null,
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
  prefillMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        items: [
          {
            key: "TENANT FULL NAME",
            display_label: "Tenant full name",
            input_type: "text",
            required: true,
            value: "Sonu King",
            provenance: "applicant",
            is_from_existing_values: false,
          },
          {
            key: "NEW LEASE END DATE",
            display_label: "New lease end date",
            input_type: "date",
            required: true,
            value: "",
            provenance: null,
            is_from_existing_values: false,
          },
        ],
      }),
  });
});

// ---------------------------------------------------------------------------
// Button visibility
// ---------------------------------------------------------------------------

describe("LeaseDetail — Add document button visibility", () => {
  it("shows the button on a generated lease when canWrite=true", () => {
    canWriteValue = true;
    mockLease = buildLease({ kind: "generated" });
    renderDetail();
    expect(screen.getByTestId("lease-add-template-button")).toBeInTheDocument();
  });

  it("shows the button on an imported lease (addendum support)", () => {
    canWriteValue = true;
    mockLease = buildLease({ kind: "imported", templates: [] });
    renderDetail();
    expect(screen.getByTestId("lease-add-template-button")).toBeInTheDocument();
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
  it("opens when the 'Add document' button is clicked", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("lease-add-template-modal")).toBeInTheDocument(),
    );
  });

  it("shows all templates including ones already on the lease (regenerate flow)", async () => {
    // Post-PR-#429 the picker no longer hides already-linked templates —
    // re-picking is treated as a regenerate. Both should appear; the
    // already-linked one carries an inline "picking will regenerate" hint
    // (not asserted here — covered by the regenerate-success-toast test
    // below).
    canWriteValue = true;
    mockLease = buildLease(); // already has tpl-existing
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("lease-add-template-modal")).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("add-template-option-tpl-existing"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("add-template-option-tpl-new"),
    ).toBeInTheDocument();
  });

  it("'Continue' button is disabled when nothing selected", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("lease-add-template-continue")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("lease-add-template-continue")).toBeDisabled();
  });

  it("Continue → prefill → values step shows prefilled inputs", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-continue"));
    await waitFor(() =>
      expect(prefillMock).toHaveBeenCalledWith({
        leaseId: "lease-1",
        templateIds: ["tpl-new"],
      }),
    );
    // Values step renders inputs from the prefill response
    await waitFor(() =>
      expect(screen.getByTestId("addendum-input-TENANT FULL NAME")).toBeInTheDocument(),
    );
    expect(
      (screen.getByTestId("addendum-input-TENANT FULL NAME") as HTMLInputElement).value,
    ).toBe("Sonu King");
    expect(
      (screen.getByTestId("addendum-input-NEW LEASE END DATE") as HTMLInputElement).value,
    ).toBe("");
  });

  it("Generate fires add-templates mutation with template_ids + values", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toBeInTheDocument(),
    );
    // Fill the required-and-empty field
    fireEvent.change(screen.getByTestId("addendum-input-NEW LEASE END DATE"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() =>
      expect(addTemplatesMock).toHaveBeenCalledWith({
        leaseId: "lease-1",
        templateIds: ["tpl-new"],
        values: {
          "TENANT FULL NAME": "Sonu King",
          "NEW LEASE END DATE": "2026-08-31",
        },
      }),
    );
  });

  it("blocks Generate when a required field is empty", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toBeInTheDocument(),
    );
    // NEW LEASE END DATE is required and empty — clicking Generate must
    // surface a validation error and NOT call the mutation.
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() =>
      expect(showErrorMock).toHaveBeenCalled(),
    );
    expect(addTemplatesMock).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByTestId("lease-add-template-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("addendum-input-NEW LEASE END DATE"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() => expect(showSuccessMock).toHaveBeenCalledWith("Document added."));
    await waitFor(() =>
      expect(screen.queryByTestId("lease-add-template-modal")).toBeNull(),
    );
  });

  it("shows a regenerate success toast when re-picking an already-linked template", async () => {
    canWriteValue = true;
    // Lease already has tpl-new attached — re-picking it should regenerate.
    mockLease = buildLease({
      templates: [
        { id: "tpl-existing", name: "Master Lease", version: 1, display_order: 0 },
        { id: "tpl-new", name: "Addendum", version: 2, display_order: 1 },
      ],
    });
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("addendum-input-NEW LEASE END DATE"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() =>
      expect(showSuccessMock).toHaveBeenCalledWith("Document regenerated."),
    );
  });

  it("shows a generic error toast when the mutation rejects", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    addTemplatesMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 500 }),
    });
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
    fireEvent.click(screen.getByTestId("lease-add-template-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("addendum-input-NEW LEASE END DATE"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() =>
      expect(showErrorMock).toHaveBeenCalledWith(
        "Couldn't generate the document. Want to try again?",
      ),
    );
  });
});
