import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SavingsIdeaCard from "@/app/features/savings/SavingsIdeaCard";
import type { SavingsIdea } from "@mybookkeeper/api-client/types/savings/savings-idea";

const setStatus = vi.fn();

vi.mock("@mybookkeeper/api-client/store/savingsApi", () => ({
  useSetSavingsIdeaStatusMutation: () => [setStatus, { isLoading: false, originalArgs: undefined }],
}));

const CARD: SavingsIdea = {
  id: "c1", category: "credit_card", title: "Open the Sapphire Preferred", savings_low_cents: 75_000,
  savings_high_cents: 90_000, effort: "medium", why_it_fits: "You spend $1,400 a month on dining and travel.",
  steps: ["Apply online", "Spend $5,000 in 3 months"], source_urls: ["https://www.chase.com/sapphire"],
  card_details: {
    sign_up_bonus: "75,000 points", minimum_spend_dollars: 5000, spend_window_months: 3, annual_fee_dollars: 95,
    first_year_value_dollars: 810, credit_impact: "A hard inquiry",
  },
  expires_on: "2027-01-15", status: "open", last_confirmed_at: "2026-11-27T12:00:00Z",
};

function renderCard(idea: SavingsIdea) {
  render(
    <MemoryRouter>
      <ul>
        <SavingsIdeaCard idea={idea} />
      </ul>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SavingsIdeaCard", () => {
  it("shows the title, saving, category, effort and end date, closed", () => {
    renderCard(CARD);
    const toggle = screen.getByTestId("savings-idea-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("$750–$900");
    expect(toggle).toHaveTextContent("Credit cards");
    expect(toggle).toHaveTextContent("Some effort");
    expect(toggle).toHaveTextContent("Ends Jan 15, 2027");
    expect(screen.queryByTestId("savings-idea-details")).not.toBeInTheDocument();
  });

  it("opens to the steps, card terms and sources by site", async () => {
    renderCard(CARD);
    await userEvent.click(screen.getByTestId("savings-idea-toggle"));
    expect(screen.getByTestId("savings-idea-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByTestId("savings-idea-steps")).getAllByRole("listitem")).toHaveLength(2);
    const terms = screen.getByTestId("savings-card-terms");
    expect(terms).toHaveTextContent("75,000 points");
    expect(terms).toHaveTextContent("$5,000 within 3 months");
    expect(terms).toHaveTextContent("$95");
    const source = within(screen.getByTestId("savings-idea-sources")).getByRole("link", { name: "chase.com" });
    expect(source).toHaveAttribute("href", "https://www.chase.com/sapphire");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links a utilities idea to the utility plans page", async () => {
    renderCard({ ...CARD, category: "utilities", card_details: null });
    await userEvent.click(screen.getByTestId("savings-idea-toggle"));
    expect(screen.getByTestId("savings-idea-app-link")).toHaveAttribute("href", "/utility-plans");
    expect(screen.queryByTestId("savings-card-terms")).not.toBeInTheDocument();
  });

  it("marks an idea done or dismissed", async () => {
    setStatus.mockReturnValue({ unwrap: () => Promise.resolve(CARD) });
    renderCard(CARD);
    await userEvent.click(screen.getByTestId("savings-idea-toggle"));
    await userEvent.click(screen.getByTestId("savings-idea-done"));
    expect(setStatus).toHaveBeenCalledWith({ id: "c1", status: "done" });
    await userEvent.click(screen.getByTestId("savings-idea-dismiss"));
    expect(setStatus).toHaveBeenCalledWith({ id: "c1", status: "dismissed" });
  });
});
