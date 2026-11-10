/**
 * Unit tests for LeaseNew page and related picker components.
 *
 * Coverage:
 * - New route renders at /leases/new
 * - Template picker lists templates, filters none (all templates shown)
 * - Applicant picker filters to approved / lease_sent stages only
 *   (excludes lease_signed, lead, etc.)
 * - URL with both params → form section is rendered
 * - Error states for template / applicant fetch failures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import LeaseNew from "@/app/pages/LeaseNew";
import MultiTemplatePicker from "@/app/features/leases/MultiTemplatePicker";
import ApplicantPicker from "@/app/features/leases/ApplicantPicker";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import { queryStatus } from "@/test/rtk-query-status";
import { queryData } from "@/test/rtk-query-data";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGetLeaseTemplatesQuery = vi.fn();
const mockUseGetLeaseTemplateByIdQuery = vi.fn();
const mockUseGetApplicantsQuery = vi.fn();
const mockUseGetApplicantByIdQuery = vi.fn();
const mockUseGetGenerateDefaultsQuery = vi.fn();
const mockUseGetMultiGenerateDefaultsQuery = vi.fn();
const mockUseCreateSignedLeaseMutation = vi.fn();
const mockUseCanWrite = vi.fn();

vi.mock("@mybookkeeper/api-client/store/leaseTemplatesApi", () => ({
  useGetGenerateDefaultsQuery: (args: unknown, opts: unknown) =>
    mockUseGetGenerateDefaultsQuery(args, opts),
  useGetLeaseTemplatesQuery: () => mockUseGetLeaseTemplatesQuery(),
  useGetLeaseTemplateByIdQuery: (id: unknown, opts: unknown) =>
    mockUseGetLeaseTemplateByIdQuery(id, opts),
  useGetMultiGenerateDefaultsQuery: (args: unknown, opts: unknown) =>
    mockUseGetMultiGenerateDefaultsQuery(args, opts),
}));

vi.mock("@mybookkeeper/api-client/store/applicantsApi", () => ({
  useGetApplicantsQuery: () => mockUseGetApplicantsQuery(),
  useGetApplicantByIdQuery: (id: unknown, opts: unknown) =>
    mockUseGetApplicantByIdQuery(id, opts),
}));

vi.mock("@mybookkeeper/api-client/store/signedLeasesApi", () => ({
  useCreateSignedLeaseMutation: () => mockUseCreateSignedLeaseMutation(),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => mockUseCanWrite(),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => vi.fn() };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEMPLATE_SUMMARY: LeaseTemplateSummary = {
  id: "tpl-1",
  user_id: "u1",
  organization_id: "org-1",
  name: "Standard Lease",
  description: "A standard residential lease",
  version: 1,
  file_count: 1,
  placeholder_count: 3,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const APPLICANTS: ApplicantSummary[] = [
  {
    id: "app-approved",
    organization_id: "org-1",
    user_id: "u1",
    inquiry_id: null,
    legal_name: "Jane Approved",
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage: "approved",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
  {
    id: "app-lease-sent",
    organization_id: "org-1",
    user_id: "u1",
    inquiry_id: null,
    legal_name: "Bob Lease Sent",
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage: "lease_sent",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
  {
    id: "app-lease-signed",
    organization_id: "org-1",
    user_id: "u1",
    inquiry_id: null,
    legal_name: "Carol Signed",
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage: "lease_signed",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
  {
    id: "app-lead",
    organization_id: "org-1",
    user_id: "u1",
    inquiry_id: null,
    legal_name: "Dave Lead",
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage: "lead",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
];

const APPROVED_APPLICANT_DETAIL = {
  ...APPLICANTS[0],
  dob: null,
  smoker: null,
  pets: null,
  referred_by: null,
  vehicle_make_model: null,
  id_document_storage_key: null,
  screening_results: [],
  references: [],
  video_call_notes: [],
  events: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLeaseNew(initialPath = "/leases/new") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/leases/new" element={<LeaseNew />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

// ---------------------------------------------------------------------------
// Tests — LeaseNew page
// ---------------------------------------------------------------------------

describe("LeaseNew page", () => {
  beforeEach(() => {
    mockUseGetLeaseTemplatesQuery.mockReturnValue({
      ...queryData({ items: [TEMPLATE_SUMMARY] }),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetApplicantsQuery.mockReturnValue({
      ...queryData({ items: APPLICANTS }),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetLeaseTemplateByIdQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetApplicantByIdQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      isFetching: false,
    });
    mockUseGetMultiGenerateDefaultsQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      isFetching: false,
    });
    mockUseCreateSignedLeaseMutation.mockReturnValue([vi.fn(), { isLoading: false }]);
  });

  it("renders the page heading", () => {
    renderLeaseNew();
    expect(screen.getByText("Generate lease")).toBeInTheDocument();
  });

  it("renders back to leases link", () => {
    renderLeaseNew();
    expect(screen.getByTestId("lease-new-back-link")).toBeInTheDocument();
  });

  it("always shows the multi-template picker", () => {
    renderLeaseNew();
    expect(screen.getByTestId("template-picker-section")).toBeInTheDocument();
    expect(screen.getByTestId("multi-template-picker-list")).toBeInTheDocument();
  });

  it("does not show applicant picker until at least one template is selected", () => {
    renderLeaseNew();
    expect(screen.queryByTestId("applicant-picker-section")).not.toBeInTheDocument();
  });

  it("shows applicant picker when template_ids has 1+ id in the URL", () => {
    renderLeaseNew("/leases/new?template_ids=tpl-1");
    expect(screen.getByTestId("applicant-picker-section")).toBeInTheDocument();
  });

  it("accepts the legacy single template_id URL param", () => {
    renderLeaseNew("/leases/new?template_id=tpl-1");
    expect(screen.getByTestId("applicant-picker-section")).toBeInTheDocument();
  });

  it("shows form section when template_ids and applicant_id are in URL", () => {
    mockUseGetApplicantByIdQuery.mockReturnValue({
      ...queryData(APPROVED_APPLICANT_DETAIL),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetMultiGenerateDefaultsQuery.mockReturnValue({
      ...queryData({ placeholders: [] }),
      isLoading: false,
      isFetching: false,
    });
    renderLeaseNew("/leases/new?template_ids=tpl-1&applicant_id=app-approved");
    expect(screen.getByTestId("lease-generate-form-section")).toBeInTheDocument();
  });

  it("starts a fresh form, dropping typed values, when the applicant changes", () => {
    mockUseGetApplicantByIdQuery.mockReturnValue({
      ...queryData(APPROVED_APPLICANT_DETAIL),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    const nameField = {
      id: "ph-1",
      template_id: "tpl-1",
      key: "TENANT FULL NAME",
      display_label: "Tenant full name",
      input_type: "text",
      required: true,
      default_source: null,
      computed_expr: null,
      display_order: 0,
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
    };
    mockUseGetMultiGenerateDefaultsQuery.mockImplementation(
      (args: { applicant_id: string }) => ({
        ...queryData({
          placeholders: [
            {
              placeholder: nameField,
              template_ids: ["tpl-1"],
              value: args.applicant_id === "app-approved" ? "Jane" : "Bob",
              provenance: "applicant",
            },
          ],
        }),
        isLoading: false,
        isFetching: false,
      }),
    );

    function SwitchApplicant() {
      const [, setParams] = useSearchParams();
      return (
        <button
          type="button"
          data-testid="switch-applicant"
          onClick={() => setParams({ template_ids: "tpl-1", applicant_id: "app-lease-sent" })}
        />
      );
    }
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/leases/new?template_ids=tpl-1&applicant_id=app-approved"]}>
          <Routes>
            <Route path="/leases/new" element={<><LeaseNew /><SwitchApplicant /></>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    const input = () =>
      screen.getByTestId("generate-field-TENANT FULL NAME").querySelector("input")!;
    fireEvent.change(input(), { target: { value: "Typed Name" } });
    expect(input().value).toBe("Typed Name");

    fireEvent.click(screen.getByTestId("switch-applicant"));
    expect(input().value).toBe("Bob");
  });

  it("shows the form skeleton while the applicant loads", () => {
    mockUseGetApplicantByIdQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: true,
      ...queryStatus({ failed: false, fetching: true }),
      refetch: vi.fn(),
    });
    renderLeaseNew("/leases/new?template_ids=tpl-1&applicant_id=app-1");
    expect(screen.getByTestId("lease-new-form-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("lease-new-applicant-error")).not.toBeInTheDocument();
  });

  it("shows applicant error banner when applicant fetch fails", () => {
    mockUseGetApplicantByIdQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      ...queryStatus({ failed: true, fetching: false }),
      refetch: vi.fn(),
    });
    renderLeaseNew("/leases/new?template_ids=tpl-1&applicant_id=app-bad");
    expect(screen.getByTestId("lease-new-applicant-error")).toBeInTheDocument();
  });

  it("keeps the applicant error, not a blank page, while Retry refetches", () => {
    mockUseGetApplicantByIdQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      ...queryStatus({ failed: true, fetching: true }),
      refetch: vi.fn(),
    });
    renderLeaseNew("/leases/new?template_ids=tpl-1&applicant_id=app-bad");
    expect(screen.getByTestId("lease-new-applicant-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.queryByTestId("lease-new-form-skeleton")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — MultiTemplatePicker
// ---------------------------------------------------------------------------

const TEMPLATE_SUMMARY_2: LeaseTemplateSummary = {
  ...TEMPLATE_SUMMARY,
  id: "tpl-2",
  name: "Move-in Inspection",
};

describe("MultiTemplatePicker", () => {
  const onToggle = vi.fn();

  function renderPicker(
    overrides: Partial<ReturnType<typeof mockUseGetLeaseTemplatesQuery>> = {},
    selectedIds: string[] = [],
  ) {
    mockUseGetLeaseTemplatesQuery.mockReturnValue({
      ...queryData({ items: [TEMPLATE_SUMMARY, TEMPLATE_SUMMARY_2] }),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
      ...overrides,
    });
    return render(
      <Provider store={store}>
        <MemoryRouter>
          <MultiTemplatePicker
            selectedIds={selectedIds}
            onToggle={onToggle}
          />
        </MemoryRouter>
      </Provider>,
    );
  }

  beforeEach(() => {
    onToggle.mockClear();
  });

  it("shows all template options as checkboxes", () => {
    renderPicker();
    expect(screen.getByTestId("multi-template-picker-list")).toBeInTheDocument();
    expect(
      screen.getByTestId(`multi-template-checkbox-${TEMPLATE_SUMMARY.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`multi-template-checkbox-${TEMPLATE_SUMMARY_2.id}`),
    ).toBeInTheDocument();
  });

  it("shows skeleton while loading", () => {
    renderPicker({ ...queryData(undefined), isLoading: true });
    expect(screen.getByTestId("multi-template-picker-skeleton")).toBeInTheDocument();
  });

  it("shows empty message when no templates exist", () => {
    renderPicker({ ...queryData({ items: [] }), isLoading: false });
    expect(screen.getByTestId("multi-template-picker-empty")).toBeInTheDocument();
  });

  it("calls onToggle with the template when a checkbox is clicked", async () => {
    renderPicker();
    await userEvent.click(
      screen.getByTestId(`multi-template-checkbox-${TEMPLATE_SUMMARY.id}`),
    );
    expect(onToggle).toHaveBeenCalledWith(TEMPLATE_SUMMARY);
  });

  it("renders the selected order badge for picked templates", () => {
    renderPicker({}, [TEMPLATE_SUMMARY_2.id, TEMPLATE_SUMMARY.id]);
    expect(
      screen.getByTestId(`multi-template-order-${TEMPLATE_SUMMARY_2.id}`),
    ).toHaveTextContent("Selected #1");
    expect(
      screen.getByTestId(`multi-template-order-${TEMPLATE_SUMMARY.id}`),
    ).toHaveTextContent("Selected #2");
  });

  it("shows error state", () => {
    renderPicker({ ...queryStatus({ failed: true, fetching: false }), ...queryData(undefined), isLoading: false });
    expect(screen.getByText(/couldn't load your templates/i)).toBeInTheDocument();
  });

  it("keeps the error, not 'No templates yet', while Retry refetches", () => {
    renderPicker({ ...queryStatus({ failed: true, fetching: true }), ...queryData(undefined), isLoading: false });
    expect(screen.getByText(/couldn't load your templates/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.queryByTestId("multi-template-picker-empty")).not.toBeInTheDocument();
  });

  it("keeps templates from an earlier load usable under the error", () => {
    renderPicker({ ...queryStatus({ failed: true, fetching: false }) });
    expect(screen.getByText(/couldn't load your templates/i)).toBeInTheDocument();
    expect(screen.getByTestId(`multi-template-checkbox-${TEMPLATE_SUMMARY.id}`)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — ApplicantPicker
// ---------------------------------------------------------------------------

describe("ApplicantPicker", () => {
  const onSelect = vi.fn();

  function renderPicker(overrides: Partial<ReturnType<typeof mockUseGetApplicantsQuery>> = {}) {
    mockUseGetApplicantsQuery.mockReturnValue({
      ...queryData({ items: APPLICANTS }),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
      ...overrides,
    });
    return render(
      <Provider store={store}>
        <MemoryRouter>
          <ApplicantPicker selectedId={null} onSelect={onSelect} />
        </MemoryRouter>
      </Provider>,
    );
  }

  beforeEach(() => {
    onSelect.mockClear();
  });

  it("shows approved applicants", () => {
    renderPicker();
    expect(screen.getByTestId("applicant-option-app-approved")).toBeInTheDocument();
  });

  it("shows lease_sent applicants", () => {
    renderPicker();
    expect(screen.getByTestId("applicant-option-app-lease-sent")).toBeInTheDocument();
  });

  it("does NOT show lease_signed applicants", () => {
    renderPicker();
    expect(screen.queryByTestId("applicant-option-app-lease-signed")).not.toBeInTheDocument();
  });

  it("does NOT show lead applicants", () => {
    renderPicker();
    expect(screen.queryByTestId("applicant-option-app-lead")).not.toBeInTheDocument();
  });

  it("shows empty message when no eligible applicants exist", () => {
    renderPicker({
      ...queryData({
        items: [
          { ...APPLICANTS[2] }, // only lease_signed — ineligible
          { ...APPLICANTS[3] }, // only lead — ineligible
        ],
      }),
    });
    expect(screen.getByTestId("applicant-picker-empty")).toBeInTheDocument();
  });

  it("calls onSelect when an applicant is clicked", async () => {
    renderPicker();
    await userEvent.click(screen.getByTestId("applicant-option-app-approved"));
    expect(onSelect).toHaveBeenCalledWith(APPLICANTS[0]);
  });

  it("shows skeleton while loading", () => {
    renderPicker({ ...queryData(undefined), isLoading: true });
    expect(screen.getByTestId("applicant-picker-skeleton")).toBeInTheDocument();
  });

  it("shows error state", () => {
    renderPicker({ ...queryStatus({ failed: true, fetching: false }), ...queryData(undefined), isLoading: false });
    expect(screen.getByText(/couldn't load your applicants/i)).toBeInTheDocument();
  });

  it("keeps the error, not 'No applicants at the right stage', while Retry refetches", () => {
    renderPicker({ ...queryStatus({ failed: true, fetching: true }), ...queryData(undefined), isLoading: false });
    expect(screen.getByText(/couldn't load your applicants/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.queryByTestId("applicant-picker-empty")).not.toBeInTheDocument();
  });
});
