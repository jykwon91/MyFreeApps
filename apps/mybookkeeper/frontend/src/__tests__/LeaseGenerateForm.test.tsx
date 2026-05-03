/**
 * Unit tests for LeaseGenerateForm — enhancements from lease-template-source-pull:
 *
 * 1. Auto-pull on applicant change (via useGetGenerateDefaultsQuery re-fetch)
 * 2. Provenance badge transitions to "manually edited" on keystroke
 * 3. "Pull from source" button overwrites fields + resets provenance
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import LeaseGenerateForm from "@/app/features/leases/LeaseGenerateForm";
import type { LeaseTemplateDetail } from "@/shared/types/lease/lease-template-detail";

// ---------------------------------------------------------------------------
// Mock RTK Query hooks
// ---------------------------------------------------------------------------

const mockUseGetGenerateDefaultsQuery = vi.fn();
const mockUseCreateSignedLeaseMutation = vi.fn();

vi.mock("@/shared/store/leaseTemplatesApi", () => ({
  useGetGenerateDefaultsQuery: (args: unknown, opts: unknown) =>
    mockUseGetGenerateDefaultsQuery(args, opts),
}));

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useCreateSignedLeaseMutation: () => mockUseCreateSignedLeaseMutation(),
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
// Test fixtures
// ---------------------------------------------------------------------------

const TEMPLATE: LeaseTemplateDetail = {
  id: "tpl-1",
  user_id: "user-1",
  organization_id: "org-1",
  name: "Standard Lease",
  description: null,
  version: 1,
  files: [],
  placeholders: [
    {
      id: "ph-1",
      template_id: "tpl-1",
      key: "TENANT FULL NAME",
      display_label: "Tenant full name",
      input_type: "text",
      required: true,
      default_source: "applicant.legal_name || inquiry.inquirer_name",
      computed_expr: null,
      display_order: 0,
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
    },
    {
      id: "ph-2",
      template_id: "tpl-1",
      key: "TENANT EMAIL",
      display_label: "Tenant email",
      input_type: "email",
      required: false,
      default_source: "inquiry.inquirer_email",
      computed_expr: null,
      display_order: 1,
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
    },
  ],
  created_at: "2026-05-02T00:00:00Z",
  updated_at: "2026-05-02T00:00:00Z",
};

const DEFAULTS_FROM_APPLICANT = {
  data: {
    defaults: [
      { key: "TENANT FULL NAME", value: "Jane Doe", provenance: "applicant" },
      { key: "TENANT EMAIL", value: null, provenance: null },
    ],
  },
  isLoading: false,
  isFetching: false,
};

const DEFAULTS_FROM_INQUIRY = {
  data: {
    defaults: [
      { key: "TENANT FULL NAME", value: "John Smith", provenance: "inquiry" },
      { key: "TENANT EMAIL", value: "john@example.com", provenance: "inquiry" },
    ],
  },
  isLoading: false,
  isFetching: false,
};

function renderForm(applicantId: string) {
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <LeaseGenerateForm template={TEMPLATE} applicantId={applicantId} />
      </Provider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LeaseGenerateForm", () => {
  beforeEach(() => {
    mockUseCreateSignedLeaseMutation.mockReturnValue([vi.fn(), { isLoading: false }]);
  });

  it("pre-fills fields from resolved defaults on mount", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    const nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;
    expect(nameInput.value).toBe("Jane Doe");
  });

  it("shows 'from applicant' provenance badge when value came from applicant", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    expect(screen.getByTestId("provenance-badge-applicant")).toBeInTheDocument();
  });

  it("shows 'from inquiry' provenance badge when value came from inquiry fallback", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_INQUIRY);
    renderForm("applicant-1");

    const badges = screen.getAllByTestId("provenance-badge-inquiry");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("transitions badge to 'manually edited' when user edits a pre-filled field", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    const nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;

    fireEvent.change(nameInput, { target: { value: "Edited Name" } });

    expect(screen.getByTestId("provenance-badge-manual")).toBeInTheDocument();
  });

  it("re-pulls fields when defaults data changes (simulates applicant switch)", async () => {
    // First render: applicant-1 with Jane Doe
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    const { rerender } = renderForm("applicant-1");

    let nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;
    expect(nameInput.value).toBe("Jane Doe");

    // Switch to applicant-2 (different defaults from inquiry)
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_INQUIRY);
    await act(async () => {
      rerender(
        <MemoryRouter>
          <Provider store={store}>
            <LeaseGenerateForm template={TEMPLATE} applicantId="applicant-2" />
          </Provider>
        </MemoryRouter>,
      );
    });

    nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;
    expect(nameInput.value).toBe("John Smith");
  });

  it("shows Pull from source button", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    expect(screen.getByTestId("pull-from-source-button")).toBeInTheDocument();
  });

  it("shows inline confirmation when Pull from source is clicked", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    fireEvent.click(screen.getByTestId("pull-from-source-button"));

    expect(screen.getByTestId("pull-from-source-confirm")).toBeInTheDocument();
  });

  it("overwrites fields and resets provenance when Pull from source is confirmed", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    const nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;

    // Edit the field manually
    fireEvent.change(nameInput, { target: { value: "Manually Edited" } });
    expect(screen.getByTestId("provenance-badge-manual")).toBeInTheDocument();

    // Click Pull from source → confirm
    fireEvent.click(screen.getByTestId("pull-from-source-button"));
    fireEvent.click(screen.getByTestId("pull-from-source-confirm-yes"));

    // Value and provenance should be reset to defaults
    expect(nameInput.value).toBe("Jane Doe");
    expect(screen.getByTestId("provenance-badge-applicant")).toBeInTheDocument();
  });

  it("dismisses confirmation without changing values when Cancel is clicked", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    const nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;
    fireEvent.change(nameInput, { target: { value: "Manually Edited" } });

    // Click Pull from source → cancel
    fireEvent.click(screen.getByTestId("pull-from-source-button"));
    fireEvent.click(screen.getByTestId("pull-from-source-confirm-no"));

    // Value preserved, confirmation gone
    expect(nameInput.value).toBe("Manually Edited");
    expect(screen.queryByTestId("pull-from-source-confirm")).not.toBeInTheDocument();
  });
});
