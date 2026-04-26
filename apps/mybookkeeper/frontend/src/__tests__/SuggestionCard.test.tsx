import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import SuggestionCard from "@/app/features/tax/SuggestionCard";
import type { TaxAdvisorSuggestionRead } from "@/shared/types/tax/tax-advisor";

vi.mock("@/shared/store/taxReturnsApi", () => ({
  useUpdateSuggestionStatusMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

const mockSuggestion: TaxAdvisorSuggestionRead = {
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
  affected_properties: ["6738 Peerless"],
};

function renderCard(suggestion: TaxAdvisorSuggestionRead = mockSuggestion) {
  return render(
    <Provider store={store}>
      <SuggestionCard suggestion={suggestion} taxReturnId="tr-1" />
    </Provider>,
  );
}

describe("SuggestionCard", () => {
  it("renders suggestion title", () => {
    renderCard();
    expect(screen.getByText("Review rental depreciation")).toBeInTheDocument();
  });

  it("renders description", () => {
    renderCard();
    expect(
      screen.getByText("Your rental property may qualify for additional depreciation deductions."),
    ).toBeInTheDocument();
  });

  it("renders estimated savings in currency format", () => {
    renderCard();
    expect(screen.getByText(/\$2,500/)).toBeInTheDocument();
  });

  it("renders action step", () => {
    renderCard();
    expect(
      screen.getByText("Compare your depreciation schedule with IRS guidelines."),
    ).toBeInTheDocument();
  });

  it("renders IRS reference", () => {
    renderCard();
    expect(screen.getByText("IRS Publication 946")).toBeInTheDocument();
  });

  it("renders affected form badge", () => {
    renderCard();
    expect(screen.getByText("Schedule E")).toBeInTheDocument();
  });

  it("renders affected properties", () => {
    renderCard();
    expect(screen.getByText("6738 Peerless")).toBeInTheDocument();
  });

  it("renders without estimated savings", () => {
    renderCard({ ...mockSuggestion, estimated_savings: null });
    expect(screen.queryByText(/Could save/)).not.toBeInTheDocument();
  });

  it("renders severity and confidence badges", () => {
    renderCard();
    expect(screen.getByText("high confidence")).toBeInTheDocument();
  });

  it("collapses card when dismissed", () => {
    renderCard();
    const dismissButton = screen.getByTitle("Dismiss");
    fireEvent.click(dismissButton);
    expect(screen.queryByText("Review rental depreciation")).not.toBeInTheDocument();
  });

  it("shows resolved state when marked resolved", () => {
    renderCard();
    const resolveButton = screen.getByTitle("Mark as resolved");
    fireEvent.click(resolveButton);
    expect(screen.getByText(/marked as resolved/)).toBeInTheDocument();
    expect(screen.queryByText("Compare your depreciation schedule with IRS guidelines.")).not.toBeInTheDocument();
  });

  it("renders pre-dismissed card as null", () => {
    const { container } = renderCard({ ...mockSuggestion, status: "dismissed" });
    expect(container.firstChild).toBeNull();
  });

  it("renders pre-resolved card with resolved state", () => {
    renderCard({ ...mockSuggestion, status: "resolved" });
    expect(screen.getByText(/marked as resolved/)).toBeInTheDocument();
  });
});
