/**
 * Unit tests for the "New lease" successor button on LeaseDetail.
 *
 * Visibility contract (matches the backend's parent-status rules):
 * - Visible when canWrite AND status ∈ {signed, active, ended} AND
 *   ``successor_lease_id`` is null.
 * - Hidden for draft / generated / sent / terminated.
 * - Hidden when a live successor already exists (the backend would 409;
 *   the button is the kinder UX).
 * - Hidden for read-only users.
 *
 * Also asserts the parent-link / successor-link breadcrumbs render when
 * the corresponding fields are set on the response.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import LeaseDetail from "@/app/pages/LeaseDetail";
import type { SignedLeaseDetail } from "@/shared/types/lease/signed-lease-detail";
import type { ApplicantDetailResponse } from "@/shared/types/applicant/applicant-detail-response";
import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";

const navigateMock = vi.fn();
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
  useEmailSignedLeaseToTenantMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    { isLoading: false },
  ],
  useExtendSignedLeaseMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    { isLoading: false },
  ],
  useUndoSignedLeaseExtensionMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    { isLoading: false },
  ],
  useUploadSignedLeaseAttachmentMutation: () => [
    vi.fn(),
    { isLoading: false },
  ],
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
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

let canWriteValue = true;
vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => canWriteValue,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

function buildLease(
  overrides: Partial<SignedLeaseDetail> = {},
): SignedLeaseDetail {
  return {
    id: "lease-1",
    user_id: "user-1",
    organization_id: "org-1",
    templates: [],
    applicant_id: "app-1",
    listing_id: null,
    kind: "imported",
    values: {},
    status: "signed",
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
    notes: null,
    generated_at: null,
    sent_at: null,
    signed_at: "2026-01-01T00:00:00Z",
    ended_at: null,
    auto_email_tenant: false,
    last_emailed_to_tenant_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    attachments: [],
    latest_extension: null,
    parent_lease_id: null,
    successor_lease_id: null,
    ...overrides,
  };
}

function buildApplicant(): ApplicantDetailResponse {
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
    stage: "lease_signed",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    screening_results: [],
    references: [],
    video_call_notes: [],
    events: [],
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
  navigateMock.mockClear();
  canWriteValue = true;
});

describe("LeaseDetail — New lease (successor) button", () => {
  it.each<[SignedLeaseStatus, "shown" | "hidden"]>([
    ["signed", "shown"],
    ["active", "shown"],
    ["ended", "shown"],
    ["draft", "hidden"],
    ["generated", "hidden"],
    ["sent", "hidden"],
    ["terminated", "hidden"],
  ])("status %s → button %s", (status, expectation) => {
    mockLease = buildLease({ status });
    mockApplicant = buildApplicant();
    renderDetail();
    const button = screen.queryByTestId("lease-new-successor-button");
    if (expectation === "shown") {
      expect(button).toBeInTheDocument();
    } else {
      expect(button).toBeNull();
    }
  });

  it("is hidden when a live successor already exists", () => {
    mockLease = buildLease({ successor_lease_id: "successor-1" });
    mockApplicant = buildApplicant();
    renderDetail();
    expect(screen.queryByTestId("lease-new-successor-button")).toBeNull();
  });

  it("is hidden for read-only users", () => {
    canWriteValue = false;
    mockLease = buildLease();
    mockApplicant = buildApplicant();
    renderDetail();
    expect(screen.queryByTestId("lease-new-successor-button")).toBeNull();
  });

  it("navigates to /leases/new with applicant_id + parent_lease_id when clicked", async () => {
    mockLease = buildLease();
    mockApplicant = buildApplicant();
    renderDetail();
    const button = screen.getByTestId("lease-new-successor-button");
    await userEvent.click(button);
    expect(navigateMock).toHaveBeenCalledWith(
      "/leases/new?applicant_id=app-1&parent_lease_id=lease-1",
    );
  });

  it("renders parent breadcrumb when this lease IS a successor", () => {
    mockLease = buildLease({ parent_lease_id: "parent-99" });
    mockApplicant = buildApplicant();
    renderDetail();
    const link = screen.getByTestId("lease-parent-link");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/leases/parent-99");
  });

  it("renders successor breadcrumb when this lease HAS a successor", () => {
    mockLease = buildLease({ successor_lease_id: "successor-42" });
    mockApplicant = buildApplicant();
    renderDetail();
    const link = screen.getByTestId("lease-successor-link");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/leases/successor-42");
  });
});
