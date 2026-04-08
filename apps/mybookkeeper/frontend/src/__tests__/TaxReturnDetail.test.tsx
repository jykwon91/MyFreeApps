import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import TaxReturnDetail from "@/app/pages/TaxReturnDetail";
import type { TaxReturn } from "@/shared/types/tax/tax-return";
import type { ValidationResult } from "@/shared/types/tax/validation-result";

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

vi.mock("@/shared/store/taxReturnsApi", () => ({
  useGetTaxReturnQuery: vi.fn(() => ({
    data: mockTaxReturn,
    isLoading: false,
  })),
  useGetFormsOverviewQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useGetFormFieldsQuery: vi.fn(() => ({
    data: undefined,
    isLoading: false,
  })),
  useGetValidationQuery: vi.fn(() => ({
    data: mockValidationResults,
    isLoading: false,
  })),
  useGetSourceDocumentsQuery: vi.fn(() => ({
    data: { documents: [], checklist: [] },
    isLoading: false,
    isError: false,
  })),
  useRecomputeMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useOverrideFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetAdvisorSuggestionsQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: { status: 404 } })),
  useGenerateAdvisorSuggestionsMutation: vi.fn(() => [vi.fn(), { isLoading: false, error: undefined }]),
  useUpdateSuggestionStatusMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

import {
  useGetTaxReturnQuery,
  useGetValidationQuery,
} from "@/shared/store/taxReturnsApi";

function renderWithRoute(id: string = "tr-1") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/tax-returns/${id}`]}>
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
    vi.mocked(useGetTaxReturnQuery).mockReturnValue({
      data: mockTaxReturn,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxReturnQuery>);
    vi.mocked(useGetValidationQuery).mockReturnValue({
      data: mockValidationResults,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetValidationQuery>);
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
    vi.mocked(useGetTaxReturnQuery).mockReturnValue({
      data: { ...mockTaxReturn, needs_recompute: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxReturnQuery>);

    renderWithRoute();

    expect(screen.getByText("Needs recompute")).toBeInTheDocument();
  });

  it("shows Ready badge for ready status", () => {
    vi.mocked(useGetTaxReturnQuery).mockReturnValue({
      data: { ...mockTaxReturn, status: "ready" as const },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxReturnQuery>);

    renderWithRoute();

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows filed date when present", () => {
    vi.mocked(useGetTaxReturnQuery).mockReturnValue({
      data: { ...mockTaxReturn, status: "filed" as const, filed_at: "2025-04-15T12:00:00Z" },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxReturnQuery>);

    renderWithRoute();

    expect(screen.getByText(/Filed on/)).toBeInTheDocument();
    expect(screen.getByText(/Apr \d{1,2}, 2025/)).toBeInTheDocument();
  });

  it("shows not found message when tax return is missing", () => {
    vi.mocked(useGetTaxReturnQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxReturnQuery>);
    vi.mocked(useGetValidationQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetValidationQuery>);

    renderWithRoute();

    expect(screen.getByText("I couldn't find that tax return.")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    vi.mocked(useGetTaxReturnQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetTaxReturnQuery>);

    const { container } = renderWithRoute();

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders validation results from mock data", () => {
    renderWithRoute();

    expect(screen.getByText("Rental income seems low")).toBeInTheDocument();
    expect(screen.getByText("Total does not match")).toBeInTheDocument();
  });
});
