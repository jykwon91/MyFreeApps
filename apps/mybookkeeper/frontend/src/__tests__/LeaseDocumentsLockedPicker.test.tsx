/**
 * Add-document flow on a lease whose documents are locked (sent, emailed or
 * signed): the picker disables linked templates with the reason, saved values
 * are read-only, a refusal is explained, and stale picks are dropped.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import { queryStatus } from "@/test/rtk-query-status";
import LeaseDetail from "@/app/pages/LeaseDetail";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import { queryData } from "@/test/rtk-query-data";
import {
  LEASE_DOCUMENTS_LOCKED_CODE,
  LEASE_DOCUMENTS_LOCKED_MESSAGE,
  LEASE_DOCUMENTS_LOCKED_NOTE,
  LEASE_VALUE_LOCKED_CODE,
  LEASE_VALUE_LOCKED_MESSAGE,
  LEASE_VALUE_READ_ONLY_NOTE,
} from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";

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

vi.mock("@mybookkeeper/api-client/store/signedLeasesApi", () => ({
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

vi.mock("@mybookkeeper/api-client/store/applicantsApi", () => ({
  useGetApplicantByIdQuery: () => ({ ...queryData(undefined) }),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
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

let templatesFailed = false;
let templatesFetching = false;

vi.mock("@mybookkeeper/api-client/store/leaseTemplatesApi", () => ({
  useGetLeaseTemplatesQuery: () => ({
    ...queryData(templatesFailed ? undefined : { items: TEMPLATES, total: 2 }),
    isLoading: false,
    ...queryStatus({ failed: templatesFailed, fetching: templatesFetching }),
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
    applicant_legal_name: null,
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
    parent_lease_id: null,
    successor_lease_id: null,
    documents_locked: false,
    ...overrides,
  };
}

function renderDetail() {
  useGetSignedLeaseByIdQueryMock.mockReturnValue({
    ...queryData(mockLease),
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
  templatesFailed = false;
  templatesFetching = false;
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

async function reachValuesStep() {
  fireEvent.click(screen.getByTestId("lease-add-template-button"));
  await waitFor(() =>
    expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-new"));
  fireEvent.click(screen.getByTestId("lease-add-template-continue"));
  await waitFor(() =>
    expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toBeInTheDocument(),
  );
}

describe("LeaseAddTemplateModal on a locked lease", () => {
  it("disables a template already on a signed lease, with the reason, but not a new one", async () => {
    mockLease = buildLease({ status: "signed", documents_locked: true });
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-existing")).toBeDisabled(),
    );
    const note = screen.getByTestId("add-template-locked-tpl-existing");
    expect(note).toHaveTextContent(LEASE_DOCUMENTS_LOCKED_NOTE);
    expect(note).toHaveClass("text-xs");
    expect(screen.getByTestId("add-template-checkbox-tpl-existing")).toHaveAttribute(
      "aria-describedby",
      "add-template-locked-tpl-existing",
    );
    expect(screen.getByTestId("add-template-checkbox-tpl-new")).toBeEnabled();
  });

  it("locks a generated lease once it has been emailed to the tenant", async () => {
    mockLease = buildLease({ status: "generated", last_emailed_to_tenant_at: "2026-05-02T00:00:00Z", documents_locked: true });
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-existing")).toBeDisabled(),
    );
  });

  it("still lets a generated, un-emailed lease re-pick a linked template", async () => {
    mockLease = buildLease({ status: "generated" });
    renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-existing")).toBeEnabled(),
    );
    expect(screen.queryByTestId("add-template-locked-tpl-existing")).not.toBeInTheDocument();
  });

  it("shows saved values read-only with the reason on a locked lease", async () => {
    mockLease = buildLease({ status: "signed" });
    prefillMock.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          items: [
            {
              key: "NEW LEASE END DATE",
              display_label: "New lease end date",
              input_type: "date",
              required: true,
              value: "2026-08-31",
              provenance: null,
              is_from_existing_values: true,
              is_read_only: true,
            },
            {
              key: "PET NAME",
              display_label: "Pet name",
              input_type: "text",
              required: false,
              value: "",
              provenance: null,
              is_from_existing_values: false,
              is_read_only: false,
            },
          ],
        }),
    });
    renderDetail();
    await reachValuesStep();
    expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toHaveAttribute("readonly");
    expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toHaveAttribute(
      "aria-describedby",
      "addendum-readonly-NEW LEASE END DATE",
    );
    expect(screen.getByTestId("addendum-readonly-NEW LEASE END DATE")).toHaveTextContent(
      LEASE_VALUE_READ_ONLY_NOTE,
    );
    expect(screen.getByTestId("addendum-input-PET NAME")).not.toHaveAttribute("readonly");
  });

  it("hides Regenerate once the lease has been emailed", () => {
    mockLease = buildLease({ status: "generated", last_emailed_to_tenant_at: "2026-05-02T00:00:00Z", documents_locked: true });
    renderDetail();
    expect(screen.queryByTestId("lease-generate-button")).not.toBeInTheDocument();
  });

  it("shows the locked message when the server refuses by code", async () => {
    mockLease = buildLease({ status: "generated" });
    addTemplatesMock.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: { detail: { code: LEASE_DOCUMENTS_LOCKED_CODE, message: "server words" } },
        }),
    });
    renderDetail();
    await reachValuesStep();
    fireEvent.change(screen.getByTestId("addendum-input-NEW LEASE END DATE"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));
    await waitFor(() =>
      expect(showErrorMock).toHaveBeenCalledWith(LEASE_DOCUMENTS_LOCKED_MESSAGE),
    );
  });

  it("says a value is already on the lease, then asks again so it turns read-only", async () => {
    mockLease = buildLease({ status: "generated" });
    const item = (readOnly: boolean) => ({
      key: "NEW LEASE END DATE", display_label: "New lease end date", input_type: "date", required: true,
      value: "2026-08-31", provenance: null, is_from_existing_values: readOnly, is_read_only: readOnly,
    });
    prefillMock.mockReturnValueOnce({ unwrap: () => Promise.resolve({ items: [item(false)] }) });
    prefillMock.mockReturnValueOnce({ unwrap: () => Promise.resolve({ items: [item(true)] }) });
    addTemplatesMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 422, data: { detail: { code: LEASE_VALUE_LOCKED_CODE, message: "server words", keys: [] } } }),
    });
    renderDetail();
    await reachValuesStep();
    expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).not.toHaveAttribute("readonly");
    fireEvent.click(screen.getByTestId("lease-add-template-confirm"));

    await waitFor(() => expect(showErrorMock).toHaveBeenCalledWith(LEASE_VALUE_LOCKED_MESSAGE));
    await waitFor(() => expect(screen.getByTestId("addendum-input-NEW LEASE END DATE")).toHaveAttribute("readonly"));
  });

  it("drops a now-blocked pick when the lease becomes locked", async () => {
    mockLease = buildLease({ status: "generated" });
    const view = renderDetail();
    fireEvent.click(screen.getByTestId("lease-add-template-button"));
    await waitFor(() =>
      expect(screen.getByTestId("add-template-checkbox-tpl-existing")).toBeEnabled(),
    );
    fireEvent.click(screen.getByTestId("add-template-checkbox-tpl-existing"));
    expect(screen.getByTestId("lease-add-template-continue")).toBeEnabled();

    mockLease = buildLease({ status: "generated", last_emailed_to_tenant_at: "2026-05-02T00:00:00Z", documents_locked: true });
    useGetSignedLeaseByIdQueryMock.mockReturnValue({
      ...queryData(mockLease),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    view.rerender(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/leases/lease-1"]}>
          <Routes>
            <Route path="/leases/:leaseId" element={<LeaseDetail />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("lease-add-template-continue")).toBeDisabled(),
    );
  });
});

function recordFile(overrides: Partial<SignedLeaseDetail["attachments"][number]>): SignedLeaseDetail["attachments"][number] {
  return {
    id: "att-2",
    lease_id: "lease-1",
    storage_key: "k2",
    filename: "signed.pdf",
    content_type: "application/pdf",
    size_bytes: 10,
    kind: "signed_lease",
    uploaded_by_user_id: "user-1",
    uploaded_at: "2026-05-03T00:00:00Z",
    is_available: true,
    is_locked: false,
    presigned_url: "https://x/z",
    ...overrides,
  };
}

describe("Lease record files on a locked lease", () => {
  it("offers delete and relabel for a signed copy added after the lock, and still blocks making a new original", () => {
    mockLease = buildLease({ status: "sent", documents_locked: true, attachments: [recordFile({})] });
    renderDetail();
    expect(screen.getByLabelText("Delete signed.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("lease-attachment-kind-picker-att-2")).toBeInTheDocument();
    expect(screen.queryByTestId("lease-attachment-locked-att-2")).not.toBeInTheDocument();
    const original = within(screen.getByTestId("lease-attachment-kind-picker-att-2")).getByRole("option", { name: "Rendered original" });
    expect(original).toBeDisabled();
    const signed = within(screen.getByTestId("lease-attachment-kind-picker-att-2")).getByRole("option", { name: "Signed lease" });
    expect(signed).toBeDisabled();
  });

  it("never offers a rendered original in the upload kind picker, locked or not", () => {
    for (const lease of [buildLease({ status: "sent", documents_locked: true }), buildLease({ status: "generated" })]) {
      mockLease = lease;
      const view = renderDetail();
      const options = within(screen.getByTestId("lease-attachment-kind-select")).getAllByRole("option");
      expect(options.map((o) => o.textContent)).not.toContain("Rendered original");
      view.unmount();
    }
  });

  it("hides delete and relabel for the rendered original, with the reason", () => {
    mockLease = buildLease({
      status: "signed",
      documents_locked: true,
      attachments: [
        {
          id: "att-1",
          storage_key: "k",
          filename: "lease.pdf",
          content_type: "application/pdf",
          size_bytes: 10,
          kind: "rendered_original",
          uploaded_by_user_id: "user-1",
          uploaded_at: "2026-05-01T00:00:00Z",
          is_available: true,
          is_locked: true,
          presigned_url: "https://x/y",
        } as SignedLeaseDetail["attachments"][number],
      ],
    });
    renderDetail();
    expect(screen.queryByLabelText("Delete lease.pdf")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lease-attachment-kind-picker-att-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("lease-attachment-locked-att-1")).toBeInTheDocument();
  });
});
