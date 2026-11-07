import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import TaxReturnDetail from "@/app/pages/TaxReturnDetail";
import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import type { ValidationResult } from "@mybookkeeper/api-client/types/tax/ValidationResult";
import type { FormOverviewItem } from "@mybookkeeper/api-client/types/tax/FormOverviewItem";
import type { FormWithFields } from "@/shared/types/tax/tax-form";
import { queryData } from "@/test/rtk-query-data";
import { queryStatus } from "@/test/rtk-query-status";

const mockTaxReturn: TaxReturn = {
  id: "tr-1",
  organization_id: "org-1",
  tax_year: 2025,
  filing_status: "married_filing_jointly",
  jurisdiction: "federal",
  status: "draft",
  needs_recompute: false,
  filed_at: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-03-01T00:00:00Z",
};

const mockValidationResults: ValidationResult[] = [
  {
    severity: "warning",
    form_name: "schedule_e",
    field_id: "line_3",
    message: "Rental income seems low",
    expected_value: 12000,
    actual_value: 5000,
  },
  {
    severity: "error",
    form_name: "form_1040",
    field_id: "line_37",
    message: "Total does not match",
    expected_value: 50000,
    actual_value: 48000,
  },
  {
    severity: "info",
    form_name: "schedule_e",
    field_id: null,
    message: "Depreciation computed automatically",
    expected_value: null,
    actual_value: null,
  },
];

vi.mock("@mybookkeeper/api-client/store/taxReturnsApi", () => ({
  useGetTaxReturnQuery: vi.fn(),
  useGetFormsOverviewQuery: vi.fn(),
  useGetValidationQuery: vi.fn(),
  useGetSourceDocumentsQuery: vi.fn(() => ({
    data: { documents: [], checklist: [] },
    isLoading: false,
    isError: false,
  })),
  useRecomputeMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/taxReturnsApi", () => ({
  useGetFormFieldsQuery: vi.fn(),
  useOverrideFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetAdvisorSuggestionsQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: { status: 404 } })),
  useGenerateAdvisorSuggestionsMutation: vi.fn(() => [vi.fn(), { isLoading: false, error: undefined }]),
  useUpdateSuggestionStatusMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

import {
  useGetFormsOverviewQuery,
  useGetTaxReturnQuery,
  useGetValidationQuery,
} from "@mybookkeeper/api-client/store/taxReturnsApi";
import { useGetFormFieldsQuery } from "@/shared/store/taxReturnsApi";

const refetch = vi.fn();

/** A hook result in the state RTK leaves it: loaded, failed, retrying or pending. */
function result<T>(data: T | undefined, { failed = false, fetching = false } = {}) {
  return {
    ...(data === undefined ? { data: undefined, currentData: undefined } : queryData(data)),
    ...queryStatus({ failed, fetching }),
    isLoading: data === undefined && !failed && fetching,
    refetch,
  };
}

function mockReturn(...args: Parameters<typeof result<TaxReturn>>) {
  vi.mocked(useGetTaxReturnQuery).mockReturnValue(
    result(...args) as unknown as ReturnType<typeof useGetTaxReturnQuery>,
  );
}

function mockOverview(...args: Parameters<typeof result<FormOverviewItem[]>>) {
  vi.mocked(useGetFormsOverviewQuery).mockReturnValue(
    result(...args) as unknown as ReturnType<typeof useGetFormsOverviewQuery>,
  );
}

function mockValidation(...args: Parameters<typeof result<ValidationResult[]>>) {
  vi.mocked(useGetValidationQuery).mockReturnValue(
    result(...args) as unknown as ReturnType<typeof useGetValidationQuery>,
  );
}

function mockForm(...args: Parameters<typeof result<FormWithFields>>) {
  vi.mocked(useGetFormFieldsQuery).mockReturnValue(
    result(...args) as unknown as ReturnType<typeof useGetFormFieldsQuery>,
  );
}

function renderWithRoute(id: string = "tr-1", search = "") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/tax-returns/${id}${search}`]}>
        <Routes>
          <Route path="/tax-returns/:id" element={<TaxReturnDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("TaxReturnDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturn(mockTaxReturn);
    mockOverview([]);
    mockValidation(mockValidationResults);
    mockForm(undefined);
  });

  it("renders the tax return header with year", () => {
    renderWithRoute();

    expect(screen.getByText("2025 Tax Return")).toBeInTheDocument();
  });

  it("renders the filing status subtitle", () => {
    renderWithRoute();

    expect(screen.getByText("married filing jointly")).toBeInTheDocument();
  });

  it("renders the Draft status badge", () => {
    renderWithRoute();

    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("renders the Recompute button", () => {
    renderWithRoute();

    expect(screen.getByText("Recompute")).toBeInTheDocument();
  });

  it("renders the Forms section heading", () => {
    renderWithRoute();

    expect(screen.getByText("Forms")).toBeInTheDocument();
  });

  it("renders the Source Documents section heading", () => {
    renderWithRoute();

    expect(screen.getByText("Source Documents")).toBeInTheDocument();
  });

  it("renders the Validation section heading", () => {
    renderWithRoute();

    expect(screen.getByText("Validation")).toBeInTheDocument();
  });

  it("renders the AI Tax Advisor section", () => {
    renderWithRoute();

    expect(screen.getByText("AI Tax Advisor")).toBeInTheDocument();
  });

  it("renders the Get Tax Advice button", () => {
    renderWithRoute();

    expect(screen.getByText("Get Tax Advice")).toBeInTheDocument();
  });

  it("renders Back to Tax Returns navigation link", () => {
    renderWithRoute();

    const backLinks = screen.getAllByText("Back to Tax Returns");
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("shows needs recompute badge when flagged", () => {
    mockReturn({ ...mockTaxReturn, needs_recompute: true });

    renderWithRoute();

    expect(screen.getByText("Needs recompute")).toBeInTheDocument();
  });

  it("shows Ready badge for ready status", () => {
    mockReturn({ ...mockTaxReturn, status: "ready" as const });

    renderWithRoute();

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows filed date when present", () => {
    mockReturn({ ...mockTaxReturn, status: "filed" as const, filed_at: "2025-04-15T12:00:00Z" });

    renderWithRoute();

    expect(screen.getByText(/Filed on/)).toBeInTheDocument();
    expect(screen.getByText(/Apr \d{1,2}, 2025/)).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    mockReturn(undefined, { fetching: true });

    const { container } = renderWithRoute();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(1);
  });

  it("waits for the validation checks before showing the forms", () => {
    mockValidation(undefined, { fetching: true });

    const { container } = renderWithRoute();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("No forms yet")).not.toBeInTheDocument();
  });

  it("offers a retry, not 'not found', when the return fails to load", async () => {
    mockReturn(undefined, { failed: true });

    renderWithRoute();

    expect(screen.getByText("I couldn't load this tax return. Want me to try again?")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't find that tax return/)).not.toBeInTheDocument();
    expect(screen.getByText("Back to Tax Returns")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("says the return isn't there, with no retry, when the API answers 404", () => {
    vi.mocked(useGetTaxReturnQuery).mockReturnValue({
      ...result<TaxReturn>(undefined),
      error: { status: 404, data: { detail: "Not found" } },
    } as unknown as ReturnType<typeof useGetTaxReturnQuery>);

    renderWithRoute();

    expect(screen.getByText("I couldn't find that tax return.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Tax Returns" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("keeps the error up while a failed load is retried", () => {
    mockReturn(undefined, { failed: true, fetching: true });

    const { container } = renderWithRoute();

    expect(screen.getByText("I couldn't load this tax return. Want me to try again?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
  });

  it("keeps the loaded return when a refresh fails", () => {
    mockReturn(mockTaxReturn, { failed: true });

    renderWithRoute();

    expect(screen.getByText("I couldn't refresh this tax return. Want me to try again?")).toBeInTheDocument();
    expect(screen.getByText("2025 Tax Return")).toBeInTheDocument();
  });

  it("says the forms didn't load instead of 'No forms yet'", async () => {
    mockOverview(undefined, { failed: true });

    renderWithRoute();

    expect(screen.getByText("I couldn't load the forms for this return. Want me to try again?")).toBeInTheDocument();
    expect(screen.queryByText("No forms yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/don't have any tax forms to review/)).not.toBeInTheDocument();
    expect(screen.queryByText("Get Tax Advice")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("says the checks didn't load instead of 'All checks passed'", () => {
    mockOverview([{ form_name: "schedule_e", instance_count: 1, field_count: 4 }]);
    mockValidation(undefined, { failed: true });

    renderWithRoute();

    expect(screen.getByText("I couldn't load the validation checks. Want me to try again?")).toBeInTheDocument();
    expect(screen.queryByText("All checks passed")).not.toBeInTheDocument();
    const forms = screen.getByRole("heading", { name: "Forms" }).closest("section")!;
    expect(within(forms).getByText("Schedule E")).toBeInTheDocument();
  });

  it("says a form didn't load instead of 'No data found'", () => {
    mockForm(undefined, { failed: true });

    renderWithRoute("tr-1", "?form=schedule_e");

    expect(screen.getByText("I couldn't load this form. Want me to try again?")).toBeInTheDocument();
    expect(screen.queryByText("No data found for this form.")).not.toBeInTheDocument();
  });

  it("says a loaded form with nothing in it has no data", () => {
    mockForm({ form_name: "schedule_e", instances: [] });

    renderWithRoute("tr-1", "?form=schedule_e");

    expect(screen.getByText("No data found for this form.")).toBeInTheDocument();
  });

  it("renders validation results from mock data", () => {
    renderWithRoute();

    expect(screen.getByText("Rental income seems low")).toBeInTheDocument();
    expect(screen.getByText("Total does not match")).toBeInTheDocument();
  });
});
