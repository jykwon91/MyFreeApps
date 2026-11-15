import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import TaxAdvisorPanel from "@/app/features/tax/TaxAdvisorPanel";
import { TAX_ADVISOR_CTA_MESSAGES } from "@mybookkeeper/api-client/constants/taxAdvisor";
import type { TaxAdvisorCachedResponse } from "@mybookkeeper/api-client/types/tax/TaxAdvisorCachedResponse";
import type { TaxAdvisorSuggestionRead } from "@mybookkeeper/api-client/types/tax/TaxAdvisorSuggestionRead";

const { getAdvisor, generateAdvisor } = vi.hoisted(() => ({
  getAdvisor: vi.fn(),
  generateAdvisor: vi.fn(),
}));

vi.mock("@mybookkeeper/api-client/store/taxReturnsApi", () => ({
  useGetAdvisorSuggestionsQuery: getAdvisor,
  useGenerateAdvisorSuggestionsMutation: generateAdvisor,
  useUpdateSuggestionStatusMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

const SUGGESTION: TaxAdvisorSuggestionRead = {
  id: "sug-1",
  db_id: "db-sug-1",
  status: "active",
  status_changed_at: null,
  generation_id: "gen-1",
  category: "deductions",
  title: "Review rental depreciation",
  description: "Your rental property may qualify for additional depreciation deductions.",
  severity: "high",
  confidence: "high",
  action: "Compare your depreciation schedule with IRS guidelines.",
  estimated_savings: 2500,
  irs_reference: "IRS Publication 946",
  affected_form: "Schedule E",
  affected_properties: [],
};

function cachedWith(suggestions: TaxAdvisorSuggestionRead[]): TaxAdvisorCachedResponse {
  return { suggestions, disclaimer: "Not tax advice.", generated_at: "2026-01-05T00:00:00Z", model_version: null };
}

function mockState(cached: TaxAdvisorCachedResponse, generateError?: unknown) {
  getAdvisor.mockReturnValue({ data: cached, isLoading: false, error: undefined });
  generateAdvisor.mockReturnValue([vi.fn(), { isLoading: false, error: generateError }]);
}

function renderPanel() {
  return render(
    <Provider store={store}>
      <TaxAdvisorPanel taxReturnId="tr-1" formCount={2} />
    </Provider>,
  );
}

describe("TaxAdvisorPanel regenerate failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says the review failed and keeps the older suggestions visible", () => {
    mockState(cachedWith([SUGGESTION]), { status: 500 });
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent(TAX_ADVISOR_CTA_MESSAGES.error);
    expect(screen.getByText("Review rental depreciation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeInTheDocument();
  });

  it("says to check back tomorrow on a rate limit and takes the button away", () => {
    mockState(cachedWith([SUGGESTION]), { status: 429 });
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent(TAX_ADVISOR_CTA_MESSAGES["rate-limited"]);
    expect(screen.getByText("Review rental depreciation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Regenerate/ })).not.toBeInTheDocument();
  });

  it("says so when the last review found nothing and the retry failed", () => {
    mockState(cachedWith([]), { status: 500 });
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent(TAX_ADVISOR_CTA_MESSAGES.error);
    expect(screen.getByText("Your tax data looks good! No issues found.")).toBeInTheDocument();
  });

  it("shows no message when nothing failed", () => {
    mockState(cachedWith([SUGGESTION]));
    renderPanel();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeInTheDocument();
  });
});
