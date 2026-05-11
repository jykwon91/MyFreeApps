/**
 * Unit tests for the "Email to tenant" button on ``LeaseDetail``.
 *
 * Visibility + enablement contract:
 * - Visible only on generated leases that have at least one attachment
 *   (no point emailing a lease that has nothing rendered yet).
 * - Disabled (with a tooltip explaining why) when the applicant has no
 *   ``contact_email`` on file — the route would 422 anyway, so the
 *   button is the kinder UX.
 * - Hidden entirely for users without write access.
 * - Clicking fires the mutation and shows a queued-toast on success.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import LeaseDetail from "@/app/pages/LeaseDetail";
import type { SignedLeaseDetail } from "@/shared/types/lease/signed-lease-detail";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { ApplicantDetailResponse } from "@/shared/types/applicant/applicant-detail-response";

const emailMock = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

let mockLease: SignedLeaseDetail | undefined;
let mockApplicant: ApplicantDetailResponse | undefined;
const useGetSignedLeaseByIdQueryMock = vi.fn();
const useGetApplicantByIdQueryMock = vi.fn();

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useGenerateSignedLeaseMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    { isLoading: false },
  ],
  useUpdateSignedLeaseMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    { isLoading: false },
  ],
  useEmailSignedLeaseToTenantMutation: () => [emailMock, { isLoading: false }],
  useUploadSignedLeaseAttachmentMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [vi.fn(), {}],
  useUpdateLeaseAttachmentMutation: () => [vi.fn(), {}],
  useGetSignedLeaseByIdQuery: (...args: unknown[]) =>
    useGetSignedLeaseByIdQueryMock(...args),
}));

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantByIdQuery: (...args: unknown[]) =>
    useGetApplicantByIdQueryMock(...args),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (...args: unknown[]) => showErrorMock(...args),
  showSuccess: (...args: unknown[]) => showSuccessMock(...args),
}));

let canWriteValue = true;
vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => canWriteValue,
}));

function buildAttachment(): SignedLeaseAttachment {
  return {
    id: "att-1",
    lease_id: "lease-1",
    filename: "Lease.pdf",
    storage_key: "signed-leases/lease-1/att-1",
    content_type: "application/pdf",
    size_bytes: 2048,
    kind: "rendered_original",
    uploaded_by_user_id: "user-1",
    uploaded_at: "2026-05-07T00:00:00Z",
    presigned_url: "https://example.com/lease.pdf",
    is_available: true,
  };
}

function buildLease(overrides: Partial<SignedLeaseDetail> = {}): SignedLeaseDetail {
  return {
    id: "lease-1",
    user_id: "user-1",
    organization_id: "org-1",
    templates: [],
    applicant_id: "app-1",
    listing_id: null,
    kind: "generated",
    values: {},
    status: "generated",
    starts_on: null,
    ends_on: null,
    notes: null,
    generated_at: "2026-05-07T00:00:00Z",
    sent_at: null,
    signed_at: null,
    ended_at: null,
    auto_email_tenant: true,
    last_emailed_to_tenant_at: null,
    created_at: "2026-05-07T00:00:00Z",
    updated_at: "2026-05-07T00:00:00Z",
    attachments: [buildAttachment()],
    latest_extension: null,
    ...overrides,
  };
}

function buildApplicant(
  overrides: Partial<ApplicantDetailResponse> = {},
): ApplicantDetailResponse {
  return {
    id: "app-1",
    organization_id: "org-1",
    user_id: "user-1",
    inquiry_id: null,
    legal_name: "Jane Doe",
    dob: null,
    employer_or_hospital: null,
    vehicle_make_model: null,
    contact_email: "tenant@example.com",
    contact_phone: null,
    id_document_storage_key: null,
    contract_start: null,
    contract_end: null,
    smoker: null,
    pets: null,
    referred_by: null,
    stage: "approved",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-05-07T00:00:00Z",
    updated_at: "2026-05-07T00:00:00Z",
    screening_results: [],
    references: [],
    video_call_notes: [],
    events: [],
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
  useGetApplicantByIdQueryMock.mockReturnValue({ data: mockApplicant });
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
  emailMock.mockClear();
  showSuccessMock.mockClear();
  showErrorMock.mockClear();
});

describe("LeaseDetail — Email to tenant button", () => {
  it("renders enabled when applicant has a contact_email", () => {
    canWriteValue = true;
    mockLease = buildLease();
    mockApplicant = buildApplicant();
    renderDetail();
    const button = screen.getByTestId("lease-email-tenant-button");
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("renders disabled when applicant has no contact_email", () => {
    canWriteValue = true;
    mockLease = buildLease();
    mockApplicant = buildApplicant({ contact_email: null });
    renderDetail();
    const button = screen.getByTestId("lease-email-tenant-button");
    expect(button).toBeDisabled();
  });

  it("is hidden when the lease has no attachments yet", () => {
    canWriteValue = true;
    mockLease = buildLease({ attachments: [] });
    mockApplicant = buildApplicant();
    renderDetail();
    expect(screen.queryByTestId("lease-email-tenant-button")).toBeNull();
  });

  it("is hidden for read-only users", () => {
    canWriteValue = false;
    mockLease = buildLease();
    mockApplicant = buildApplicant();
    renderDetail();
    expect(screen.queryByTestId("lease-email-tenant-button")).toBeNull();
  });

  it("is shown for imported leases that have a rendered addendum", () => {
    // After PR #415 imported leases can attach addendum templates that
    // produce ``rendered_original`` attachments. The host should be able to
    // email those addenda the same way as a generated lease.
    canWriteValue = true;
    mockLease = buildLease({ kind: "imported" });
    mockApplicant = buildApplicant();
    renderDetail();
    expect(screen.getByTestId("lease-email-tenant-button")).toBeInTheDocument();
  });

  it("is hidden when the imported lease has no rendered/signed-lease attachments", () => {
    // E.g., a freshly-imported lease where the host uploaded only an
    // inspection PDF or insurance proof — nothing to email yet.
    canWriteValue = true;
    mockLease = buildLease({
      kind: "imported",
      attachments: [
        {
          ...buildAttachment(),
          kind: "move_in_inspection",
        },
      ],
    });
    mockApplicant = buildApplicant();
    renderDetail();
    expect(screen.queryByTestId("lease-email-tenant-button")).toBeNull();
  });

  it("fires the mutation and shows success toast on click", async () => {
    canWriteValue = true;
    mockLease = buildLease();
    mockApplicant = buildApplicant();
    renderDetail();
    const button = screen.getByTestId("lease-email-tenant-button");
    await userEvent.click(button);
    expect(emailMock).toHaveBeenCalledWith("lease-1");
    await waitFor(() => {
      expect(showSuccessMock).toHaveBeenCalledWith(
        expect.stringContaining("Email queued"),
      );
    });
  });
});
