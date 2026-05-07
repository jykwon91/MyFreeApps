/**
 * Unit tests for the Generate/Regenerate button visibility logic on
 * ``LeaseDetail``.
 *
 * Background: previously the Generate button only showed when
 * ``status === "draft"``. If a lease ended up in ``status === "generated"``
 * with zero attachments (deleted via the new delete-attachment flow, or a
 * partial generation in a previous deploy), the host had no way to re-render
 * the documents from the lease detail page. This regression contract pins
 * the visibility rules.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import LeaseDetail from "@/app/pages/LeaseDetail";
import type { SignedLeaseDetail } from "@/shared/types/lease/signed-lease-detail";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

const generateMock = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
const updateMock = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

let mockLease: SignedLeaseDetail | undefined;
const useGetSignedLeaseByIdQueryMock = vi.fn();

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useGenerateSignedLeaseMutation: () => [generateMock, { isLoading: false }],
  useUpdateSignedLeaseMutation: () => [updateMock, { isLoading: false }],
  useUploadSignedLeaseAttachmentMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [vi.fn(), {}],
  useUpdateLeaseAttachmentMutation: () => [vi.fn(), {}],
  useGetSignedLeaseByIdQuery: (...args: unknown[]) =>
    useGetSignedLeaseByIdQueryMock(...args),
}));

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantByIdQuery: () => ({ data: undefined }),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

let canWriteValue = true;
vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => canWriteValue,
}));

function buildLease(overrides: Partial<SignedLeaseDetail> = {}): SignedLeaseDetail {
  return {
    id: "lease-1",
    user_id: "user-1",
    organization_id: "org-1",
    templates: [
      { id: "tpl-1", name: "Lease Agreement", version: 1, display_order: 0 },
    ],
    applicant_id: "app-1",
    listing_id: null,
    kind: "generated",
    values: {},
    status: "draft",
    starts_on: null,
    ends_on: null,
    notes: null,
    generated_at: null,
    sent_at: null,
    signed_at: null,
    ended_at: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    attachments: [],
    ...overrides,
  };
}

function attachment(): SignedLeaseAttachment {
  return {
    id: "att-1",
    lease_id: "lease-1",
    filename: "Lease.docx",
    storage_key: "signed-leases/lease-1/att-1",
    content_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 2048,
    kind: "rendered_original",
    uploaded_by_user_id: "user-1",
    uploaded_at: "2026-05-01T00:00:00Z",
    presigned_url: "https://example.com/lease.docx",
    is_available: true,
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

describe("LeaseDetail — Generate/Regenerate button visibility", () => {
  it("shows 'Generate' on a draft lease with no attachments", () => {
    canWriteValue = true;
    mockLease = buildLease({ status: "draft", attachments: [] });
    renderDetail();
    const button = screen.getByTestId("lease-generate-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent(/Generate/);
    expect(button).not.toHaveTextContent(/Regenerate/);
  });

  it("shows 'Regenerate' when the lease is generated but has no attachments", () => {
    canWriteValue = true;
    mockLease = buildLease({ status: "generated", attachments: [] });
    renderDetail();
    const button = screen.getByTestId("lease-generate-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent(/Regenerate/);
  });

  it("hides the button when the lease has attachments", () => {
    canWriteValue = true;
    mockLease = buildLease({ status: "generated", attachments: [attachment()] });
    renderDetail();
    expect(screen.queryByTestId("lease-generate-button")).toBeNull();
  });

  it("hides the button when the user cannot write", () => {
    canWriteValue = false;
    mockLease = buildLease({ status: "draft", attachments: [] });
    renderDetail();
    expect(screen.queryByTestId("lease-generate-button")).toBeNull();
  });

  it("hides the button on an imported lease (no template to render from)", () => {
    canWriteValue = true;
    mockLease = buildLease({
      kind: "imported",
      status: "draft",
      attachments: [],
      templates: [],
    });
    renderDetail();
    expect(screen.queryByTestId("lease-generate-button")).toBeNull();
  });
});
