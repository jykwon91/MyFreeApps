/**
 * Moving between leases (prior / successor links) keeps the route mounted.
 * Per-lease state must not leak: the Notes editor shows the lease on screen
 * and blurring it never writes one lease's notes onto another.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import LeaseDetail from "@/app/pages/LeaseDetail";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { queryData } from "@/test/rtk-query-data";

const updateMock = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

const LEASE_A = buildLease({ id: "lease-a", notes: "Notes for A", successor_lease_id: "lease-b" });
const LEASE_B = buildLease({ id: "lease-b", notes: "Notes for B", parent_lease_id: "lease-a" });
const LEASES: Record<string, SignedLeaseDetail> = { "lease-a": LEASE_A, "lease-b": LEASE_B };

vi.mock("@mybookkeeper/api-client/store/signedLeasesApi", () => ({
  useGenerateSignedLeaseMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateSignedLeaseMutation: () => [updateMock, { isLoading: false }],
  useEmailSignedLeaseToTenantMutation: () => [vi.fn(), { isLoading: false }],
  useUploadSignedLeaseAttachmentMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteSignedLeaseAttachmentMutation: () => [vi.fn(), {}],
  useUpdateLeaseAttachmentMutation: () => [vi.fn(), {}],
  useGetSignedLeaseByIdQuery: (id: string) => ({
    ...queryData(LEASES[id]),
    isFetching: false,
    error: undefined,
    refetch: vi.fn(),
  }),
}));

vi.mock("@mybookkeeper/api-client/store/applicantsApi", () => ({
  useGetApplicantByIdQuery: () => ({ data: undefined, currentData: undefined, refetch: vi.fn() }),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: () => true }));

function buildLease(overrides: Partial<SignedLeaseDetail>): SignedLeaseDetail {
  return {
    id: "lease",
    user_id: "user-1",
    organization_id: "org-1",
    templates: [],
    applicant_id: "app-1",
    applicant_legal_name: null,
    listing_id: null,
    kind: "imported",
    values: {},
    status: "signed",
    starts_on: null,
    ends_on: null,
    notes: null,
    generated_at: null,
    sent_at: null,
    signed_at: null,
    ended_at: null,
    auto_email_tenant: false,
    last_emailed_to_tenant_at: null,
    created_at: "2026-05-07T00:00:00Z",
    updated_at: "2026-05-07T00:00:00Z",
    attachments: [],
    latest_extension: null,
    parent_lease_id: null,
    successor_lease_id: null,
    documents_locked: false,
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/leases/:leaseId" element={<LeaseDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => updateMock.mockClear());

describe("LeaseDetail — moving between leases", () => {
  it("shows each lease's own notes after A -> B -> A and never saves another lease's notes", async () => {
    const user = userEvent.setup();
    renderAt("/leases/lease-a");

    await user.click(screen.getByTestId("lease-tab-notes"));
    expect(screen.getByLabelText("Internal notes")).toHaveValue("Notes for A");

    await user.click(screen.getByText("View successor lease"));
    await user.click(screen.getByTestId("lease-tab-notes"));
    expect(screen.getByLabelText("Internal notes")).toHaveValue("Notes for B");

    await user.click(screen.getByText("View prior lease this supersedes"));
    await user.click(screen.getByTestId("lease-tab-notes"));
    const notes = screen.getByLabelText("Internal notes");
    expect(notes).toHaveValue("Notes for A");

    await user.click(notes);
    await user.tab();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("resets the open tab when moving to another lease", async () => {
    const user = userEvent.setup();
    renderAt("/leases/lease-a");
    await user.click(screen.getByTestId("lease-tab-notes"));
    await user.click(screen.getByText("View successor lease"));
    expect(screen.queryByTestId("lease-notes-section")).not.toBeInTheDocument();
  });
});
