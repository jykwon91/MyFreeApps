import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SavingsBody, { type SavingsBodyProps } from "@/app/features/savings/SavingsBody";
import type { SavingsIdea } from "@mybookkeeper/api-client/types/savings/savings-idea";
import type { SavingsOverview } from "@mybookkeeper/api-client/types/savings/savings-overview";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";

const toggle = vi.fn();
const start = vi.fn();

vi.mock("@mybookkeeper/api-client/store/savingsApi", () => ({
  useSetSavingsResearchEnabledMutation: () => [toggle, { isLoading: false }],
  useStartSavingsResearchMutation: () => [start, { isLoading: false }],
  useSetSavingsIdeaStatusMutation: () => [vi.fn(), { isLoading: false }],
}));

function idea(overrides: Partial<SavingsIdea>): SavingsIdea {
  return {
    id: "i1", category: "subscription", title: "Cancel Hulu", savings_low_cents: 12_000, savings_high_cents: 12_000,
    effort: "low", why_it_fits: "You pay $10 a month and watch little.", steps: ["Open Hulu", "Cancel"],
    source_urls: ["https://www.hulu.com/cancel"], card_details: null, expires_on: null, status: "open",
    last_confirmed_at: "2026-11-27T12:00:00Z", ...overrides,
  };
}

const CARD = idea({ id: "i2", category: "credit_card", title: "Open the Sapphire Preferred", savings_low_cents: 75_000, savings_high_cents: 90_000 });
const HULU = idea({});

function overview(overrides: Partial<SavingsOverview>): SavingsOverview {
  return {
    research_enabled: true, total_savings_low_cents: 87_000, total_savings_high_cents: 102_000,
    last_researched_at: "2026-11-27T12:00:00Z", next_research_due_at: "2026-11-28T12:00:00Z",
    run_in_progress: false, latest_run: null, manual_runs_left: 2, manual_run_limit: 3, next_manual_run_at: null,
    ideas: [CARD, HULU], ...overrides,
  };
}

function renderBody(overrides: Partial<SavingsBodyProps>) {
  const props: SavingsBodyProps = {
    data: overview({}), isLoading: false, isError: false, isRetrying: false, onRetry: vi.fn(),
    category: null, onCategoryChange: vi.fn(), ...overrides,
  };
  render(
    <MemoryRouter>
      <SavingsBody {...props} />
    </MemoryRouter>,
  );
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SavingsBody", () => {
  it("shows the skeleton while loading", () => {
    renderBody({ isLoading: true, data: undefined });
    expect(screen.getByTestId("savings-skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("savings-skeleton-tile")).toHaveLength(3);
  });

  it("offers a retry when it can't load", async () => {
    const props = renderBody({ isError: true, data: undefined });
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("with research off, says what is sent to Anthropic before the switch", async () => {
    toggle.mockReturnValue({ unwrap: () => Promise.resolve(overview({})) });
    renderBody({ data: overview({ research_enabled: false, ideas: [] }) });
    expect(screen.getByTestId("savings-off")).toHaveTextContent("sent to Anthropic");
    expect(screen.getByTestId("savings-off")).toHaveTextContent("searches the web");
    await userEvent.click(screen.getByTestId("savings-turn-on"));
    expect(toggle).toHaveBeenCalledWith(true);
  });

  it("before the first run, says one is on the way", () => {
    renderBody({ data: overview({ ideas: [], last_researched_at: null, total_savings_low_cents: 0, total_savings_high_cents: 0 }) });
    expect(screen.getByText(MSG.emptyFirstRun)).toBeInTheDocument();
    expect(screen.getByTestId("savings-last-researched")).toHaveTextContent(MSG.never);
  });

  it("shows the total, the ideas biggest first, and the disclaimer", () => {
    renderBody({});
    expect(screen.getByTestId("savings-total")).toHaveTextContent("$870–$1,020");
    const titles = screen.getAllByTestId("savings-idea-amount").map((el) => el.textContent);
    expect(titles).toEqual(["$750–$900", "$120"]);
    expect(screen.getByTestId("savings-runs-left")).toHaveTextContent("2 of 3 research runs left today");
    expect(screen.getByTestId("savings-disclaimer")).toHaveTextContent("isn't financial advice");
  });

  it("filters by category through the URL handler, offering only categories that have ideas", async () => {
    const props = renderBody({});
    expect(screen.queryByTestId("savings-filter-insurance")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("savings-filter-credit_card"));
    expect(props.onCategoryChange).toHaveBeenCalledWith("credit_card");
  });

  it("shows only the chosen category", () => {
    renderBody({ category: "subscription" });
    expect(screen.getByText("Cancel Hulu")).toBeInTheDocument();
    expect(screen.queryByText("Open the Sapphire Preferred")).not.toBeInTheDocument();
  });

  it("while a run is going, shows the banner and a busy Research now", () => {
    renderBody({ data: overview({ run_in_progress: true, next_research_due_at: null }) });
    expect(screen.getByTestId("savings-running")).toBeInTheDocument();
    expect(screen.getByTestId("savings-research-now")).toBeDisabled();
    expect(screen.getByTestId("savings-next-research")).toHaveTextContent(MSG.whileRunning);
  });

  it("at the daily limit, disables Research now and says when it's back", () => {
    renderBody({ data: overview({ manual_runs_left: 0, next_manual_run_at: "2026-11-28T09:00:00Z" }) });
    expect(screen.getByTestId("savings-research-now")).toBeDisabled();
    expect(screen.getByTestId("savings-runs-left")).toHaveTextContent("You've used today's research runs");
  });

  it("notes a failed last run", () => {
    renderBody({
      data: overview({
        latest_run: {
          id: "r1", trigger: "manual", status: "failed", started_at: "2026-11-27T12:00:00Z",
          finished_at: "2026-11-27T12:05:00Z", error_type: "overloaded_error", ideas_found: 0,
        },
      }),
    });
    expect(screen.getByTestId("savings-run-failed")).toHaveTextContent(MSG.lastRunFailed);
  });

  it("Research now starts a run and confirms it", async () => {
    start.mockReturnValue({ unwrap: () => Promise.resolve({ run_id: "r2" }) });
    renderBody({});
    await userEvent.click(screen.getByTestId("savings-research-now"));
    expect(start).toHaveBeenCalled();
  });
});
