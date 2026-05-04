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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import LeaseNew from "@/app/pages/LeaseNew";
import TemplatePicker from "@/app/features/leases/TemplatePicker";
import ApplicantPicker from "@/app/features/leases/ApplicantPicker";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGetLeaseTemplatesQuery = vi.fn();
const mockUseGetLeaseTemplateByIdQuery = vi.fn();
const mockUseGetApplicantsQuery = vi.fn();
const mockUseGetApplicantByIdQuery = vi.fn();
const mockUseGetGenerateDefaultsQuery = vi.fn();
const mockUseCreateSignedLeaseMutation = vi.fn();
const mockUseCanWrite = vi.fn();

vi.mock("@/shared/store/leaseTemplatesApi", () => ({
  useGetLeaseTemplatesQuery: () => mockUseGetLeaseTemplatesQuery(),
  useGetLeaseTemplateByIdQuery: (id: unknown, opts: unknown) =>
    mockUseGetLeaseTemplateByIdQuery(id, opts),
  useGetGenerateDefaultsQuery: (args: unknown, opts: unknown) =>
    mockUseGetGenerateDefaultsQuery(args, opts),
}));

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantsQuery: () => mockUseGetApplicantsQuery(),
  useGetApplicantByIdQuery: (id: unknown, opts: unknown) =>
    mockUseGetApplicantByIdQuery(id, opts),
}));

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useCreateSignedLeaseMutation: () => mockUseCreateSignedLeaseMutation(),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => mockUseCanWrite(),
}));

vi.mock("@/shared/lib/toast-store", () => ({
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

const TEMPLATE_DETAIL = {
  ...TEMPLATE_SUMMARY,
  files: [],
  placeholders: [],
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
      data: { items: [TEMPLATE_SUMMARY] },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetApplicantsQuery.mockReturnValue({
      data: { items: APPLICANTS },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetLeaseTemplateByIdQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetApplicantByIdQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      data: undefined,
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

  it("shows template picker when no template_id in URL", () => {
    renderLeaseNew();
    expect(screen.getByTestId("template-picker-section")).toBeInTheDocument();
  });

  it("does not show applicant picker when no template selected yet", () => {
    renderLeaseNew();
    expect(screen.queryByTestId("applicant-picker-section")).not.toBeInTheDocument();
  });

  it("shows applicant picker after template_id is in URL", () => {
    mockUseGetLeaseTemplateByIdQuery.mockReturnValue({
      data: TEMPLATE_DETAIL,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderLeaseNew("/leases/new?template_id=tpl-1");
    expect(screen.getByTestId("applicant-picker-section")).toBeInTheDocument();
  });

  it("shows form section when both template_id and applicant_id are in URL", () => {
    mockUseGetLeaseTemplateByIdQuery.mockReturnValue({
      data: TEMPLATE_DETAIL,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetApplicantByIdQuery.mockReturnValue({
      data: APPROVED_APPLICANT_DETAIL,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      data: { defaults: [] },
      isLoading: false,
      isFetching: false,
    });
    renderLeaseNew("/leases/new?template_id=tpl-1&applicant_id=app-approved");
    expect(screen.getByTestId("lease-generate-form-section")).toBeInTheDocument();
  });

  it("shows template error banner when template fetch fails", () => {
    mockUseGetLeaseTemplateByIdQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch: vi.fn(),
    });
    renderLeaseNew("/leases/new?template_id=tpl-bad");
    expect(screen.getByTestId("lease-new-template-error")).toBeInTheDocument();
  });

  it("shows applicant error banner when applicant fetch fails", () => {
    mockUseGetLeaseTemplateByIdQuery.mockReturnValue({
      data: TEMPLATE_DETAIL,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseGetApplicantByIdQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch: vi.fn(),
    });
    renderLeaseNew("/leases/new?template_id=tpl-1&applicant_id=app-bad");
    expect(screen.getByTestId("lease-new-applicant-error")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — TemplatePicker
// ---------------------------------------------------------------------------

describe("TemplatePicker", () => {
  const onSelect = vi.fn();

  function renderPicker(overrides: Partial<ReturnType<typeof mockUseGetLeaseTemplatesQuery>> = {}) {
    mockUseGetLeaseTemplatesQuery.mockReturnValue({
      data: { items: [TEMPLATE_SUMMARY] },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
      ...overrides,
    });
    return render(
      <Provider store={store}>
        <MemoryRouter>
          <TemplatePicker selectedId={null} onSelect={onSelect} />
        </MemoryRouter>
      </Provider>,
    );
  }

  beforeEach(() => {
    onSelect.mockClear();
  });

  it("shows template options", () => {
    renderPicker();
    expect(screen.getByTestId("template-picker-list")).toBeInTheDocument();
    expect(screen.getByTestId(`template-option-${TEMPLATE_SUMMARY.id}`)).toBeInTheDocument();
  });

  it("shows skeleton while loading", () => {
    renderPicker({ data: undefined, isLoading: true });
    expect(screen.getByTestId("template-picker-skeleton")).toBeInTheDocument();
  });

  it("shows empty message when no templates exist", () => {
    renderPicker({ data: { items: [] }, isLoading: false });
    expect(screen.getByTestId("template-picker-empty")).toBeInTheDocument();
  });

  it("calls onSelect when a template is clicked", async () => {
    renderPicker();
    await userEvent.click(
      screen.getByTestId(`template-option-${TEMPLATE_SUMMARY.id}`),
    );
    expect(onSelect).toHaveBeenCalledWith(TEMPLATE_SUMMARY);
  });

  it("shows error state", () => {
    renderPicker({ isError: true, data: undefined, isLoading: false });
    expect(screen.getByText(/couldn't load your templates/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — ApplicantPicker
// ---------------------------------------------------------------------------

describe("ApplicantPicker", () => {
  const onSelect = vi.fn();

  function renderPicker(overrides: Partial<ReturnType<typeof mockUseGetApplicantsQuery>> = {}) {
    mockUseGetApplicantsQuery.mockReturnValue({
      data: { items: APPLICANTS },
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
      data: {
        items: [
          { ...APPLICANTS[2] }, // only lease_signed — ineligible
          { ...APPLICANTS[3] }, // only lead — ineligible
        ],
      },
    });
    expect(screen.getByTestId("applicant-picker-empty")).toBeInTheDocument();
  });

  it("calls onSelect when an applicant is clicked", async () => {
    renderPicker();
    await userEvent.click(screen.getByTestId("applicant-option-app-approved"));
    expect(onSelect).toHaveBeenCalledWith(APPLICANTS[0]);
  });

  it("shows skeleton while loading", () => {
    renderPicker({ data: undefined, isLoading: true });
    expect(screen.getByTestId("applicant-picker-skeleton")).toBeInTheDocument();
  });

  it("shows error state", () => {
    renderPicker({ isError: true, data: undefined, isLoading: false });
    expect(screen.getByText(/couldn't load your applicants/i)).toBeInTheDocument();
  });
});
