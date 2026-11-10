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
import { queryData } from "@/test/rtk-query-data";
import { queryStatus } from "@/test/rtk-query-status";
import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";

// ---------------------------------------------------------------------------
// Mock RTK Query hooks
// ---------------------------------------------------------------------------

const mockUseGetGenerateDefaultsQuery = vi.fn();
const mockUseGetMultiGenerateDefaultsQuery = vi.fn();
const mockUseCreateSignedLeaseMutation = vi.fn();

vi.mock("@mybookkeeper/api-client/store/leaseTemplatesApi", () => ({
  useGetGenerateDefaultsQuery: (args: unknown, opts: unknown) =>
    mockUseGetGenerateDefaultsQuery(args, opts),
  useGetMultiGenerateDefaultsQuery: (args: unknown, opts: unknown) =>
    mockUseGetMultiGenerateDefaultsQuery(args, opts),
}));

vi.mock("@mybookkeeper/api-client/store/signedLeasesApi", () => ({
  useCreateSignedLeaseMutation: () => mockUseCreateSignedLeaseMutation(),
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
  ...queryData({
      defaults: [
        { key: "TENANT FULL NAME", value: "Jane Doe", provenance: "applicant" },
        { key: "TENANT EMAIL", value: null, provenance: null },
      ],
    }),
  isLoading: false,
  isFetching: false,
};

const DEFAULTS_FROM_INQUIRY = {
  ...queryData({
      defaults: [
        { key: "TENANT FULL NAME", value: "John Smith", provenance: "inquiry" },
        { key: "TENANT EMAIL", value: "john@example.com", provenance: "inquiry" },
      ],
    }),
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
    // Default the multi-template query to "skipped" — single-template tests
    // never trigger it.
    mockUseGetMultiGenerateDefaultsQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      isFetching: false,
    });
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

  // ---------------------------------------------------------------------
  // Multi-template mode
  // ---------------------------------------------------------------------

  describe("multi-template mode", () => {
    const MULTI_DEFAULTS = {
      ...queryData({
        placeholders: [
          {
            placeholder: TEMPLATE.placeholders[0],
            template_ids: ["tpl-1", "tpl-2"],
            value: "Jane Doe",
            provenance: "applicant",
          },
          {
            placeholder: TEMPLATE.placeholders[1],
            template_ids: ["tpl-1"],
            value: null,
            provenance: null,
          },
        ],
      }),
      isLoading: false,
      isFetching: false,
    };

    function renderMulti() {
      return render(
        <MemoryRouter>
          <Provider store={store}>
            <LeaseGenerateForm
              templateIds={["tpl-1", "tpl-2"]}
              templateLabels={{ "tpl-1": "Master Lease", "tpl-2": "Addendum" }}
              applicantId="applicant-1"
            />
          </Provider>
        </MemoryRouter>,
      );
    }

    it("merges placeholders across templates and pre-fills with first-template-wins value", () => {
      mockUseGetMultiGenerateDefaultsQuery.mockReturnValue(MULTI_DEFAULTS);
      renderMulti();

      const nameInput = screen
        .getByTestId("generate-field-TENANT FULL NAME")
        .querySelector("input")!;
      expect(nameInput.value).toBe("Jane Doe");
    });

    it("shows 'Used by' hint for placeholders defined in 2+ templates", () => {
      mockUseGetMultiGenerateDefaultsQuery.mockReturnValue(MULTI_DEFAULTS);
      renderMulti();

      expect(
        screen.getByTestId("placeholder-used-by-TENANT FULL NAME"),
      ).toHaveTextContent("Used by: Master Lease, Addendum");
    });

    it("does NOT show 'Used by' hint for placeholders in only one template", () => {
      mockUseGetMultiGenerateDefaultsQuery.mockReturnValue(MULTI_DEFAULTS);
      renderMulti();

      expect(
        screen.queryByTestId("placeholder-used-by-TENANT EMAIL"),
      ).not.toBeInTheDocument();
    });

    it("submits with template_ids containing all selected templates", async () => {
      mockUseGetMultiGenerateDefaultsQuery.mockReturnValue(MULTI_DEFAULTS);
      const unwrap = vi.fn().mockResolvedValue({ id: "lease-1" });
      const createMutation = vi.fn().mockReturnValue({ unwrap });
      mockUseCreateSignedLeaseMutation.mockReturnValue([
        createMutation,
        { isLoading: false },
      ]);
      renderMulti();

      // Submit (the only required field is TENANT FULL NAME and it's filled).
      fireEvent.submit(screen.getByTestId("lease-generate-form"));

      await Promise.resolve();
      expect(createMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          template_ids: ["tpl-1", "tpl-2"],
          applicant_id: "applicant-1",
        }),
      );
    });
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

  it("disables submit and ignores a submit event while the defaults are still loading", async () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: true,
      ...queryStatus({ failed: false, fetching: true }),
    });
    const createMutation = vi.fn();
    mockUseCreateSignedLeaseMutation.mockReturnValue([createMutation, { isLoading: false }]);
    renderForm("applicant-1");

    expect(screen.getByTestId("lease-generate-submit")).toBeDisabled();
    fireEvent.submit(screen.getByTestId("lease-generate-form"));
    await Promise.resolve();
    expect(createMutation).not.toHaveBeenCalled();
  });

  it("enables submit once the defaults have loaded", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    renderForm("applicant-1");

    expect(screen.getByTestId("lease-generate-submit")).toBeEnabled();
  });

  it("keeps submit disabled, shows an error with Try again, and sends nothing when the defaults fail to load", async () => {
    const refetch = vi.fn();
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      ...queryStatus({ failed: true, fetching: false }),
      refetch,
    });
    const createMutation = vi.fn();
    mockUseCreateSignedLeaseMutation.mockReturnValue([createMutation, { isLoading: false }]);
    renderForm("applicant-1");

    expect(screen.getByTestId("lease-generate-submit")).toBeDisabled();
    fireEvent.submit(screen.getByTestId("lease-generate-form"));
    await Promise.resolve();
    expect(createMutation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("keeps submit enabled and the typed value when the defaults refetch in the background", async () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    const { rerender } = renderForm("applicant-1");

    const nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;
    fireEvent.change(nameInput, { target: { value: "Typed Name" } });

    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      ...queryData({
        defaults: [
          { key: "TENANT FULL NAME", value: "Refetched Name", provenance: "applicant" },
          { key: "TENANT EMAIL", value: "new@example.com", provenance: "applicant" },
        ],
      }),
      isLoading: false,
      isFetching: true,
    });
    await act(async () => {
      rerender(
        <MemoryRouter>
          <Provider store={store}>
            <LeaseGenerateForm template={TEMPLATE} applicantId="applicant-1" />
          </Provider>
        </MemoryRouter>,
      );
    });

    expect(screen.getByTestId("lease-generate-submit")).toBeEnabled();
    expect(nameInput.value).toBe("Typed Name");
    const emailInput = screen.getByTestId("generate-field-TENANT EMAIL")
      .querySelector("input")!;
    expect(emailInput.value).toBe("new@example.com");
  });

  it("sends only the current asked fields, trimmed", async () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      ...queryData({
        defaults: [
          ...DEFAULTS_FROM_APPLICANT.currentData.defaults,
          { key: "STALE KEY", value: "gone", provenance: "applicant" },
        ],
      }),
      isLoading: false,
      isFetching: false,
    });
    const unwrap = vi.fn().mockResolvedValue({ id: "lease-1" });
    const createMutation = vi.fn().mockReturnValue({ unwrap });
    mockUseCreateSignedLeaseMutation.mockReturnValue([createMutation, { isLoading: false }]);
    renderForm("applicant-1");

    const nameInput = screen.getByTestId("generate-field-TENANT FULL NAME")
      .querySelector("input")!;
    fireEvent.change(nameInput, { target: { value: "  Padded  " } });
    fireEvent.submit(screen.getByTestId("lease-generate-form"));
    await Promise.resolve();

    expect(createMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        values: { "TENANT FULL NAME": "Padded", "TENANT EMAIL": "" },
      }),
    );
  });

  it("shows a field skeleton matching the template's asked fields while loading, then the inputs", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: true,
      ...queryStatus({ failed: false, fetching: true }),
    });
    const { rerender } = renderForm("applicant-1");

    expect(screen.getByTestId("lease-generate-fields-skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("lease-generate-field-skeleton")).toHaveLength(
      TEMPLATE.placeholders.length,
    );
    expect(screen.queryByTestId("lease-generate-fields")).not.toBeInTheDocument();

    mockUseGetGenerateDefaultsQuery.mockReturnValue(DEFAULTS_FROM_APPLICANT);
    rerender(
      <MemoryRouter>
        <Provider store={store}>
          <LeaseGenerateForm template={TEMPLATE} applicantId="applicant-1" />
        </Provider>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("lease-generate-fields-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("lease-generate-fields")).toBeInTheDocument();
  });

  it("shows no skeleton when the defaults fail to load", () => {
    mockUseGetGenerateDefaultsQuery.mockReturnValue({
      ...queryData(undefined),
      isLoading: false,
      ...queryStatus({ failed: true, fetching: false }),
      refetch: vi.fn(),
    });
    renderForm("applicant-1");

    expect(screen.queryByTestId("lease-generate-fields-skeleton")).not.toBeInTheDocument();
  });
});
