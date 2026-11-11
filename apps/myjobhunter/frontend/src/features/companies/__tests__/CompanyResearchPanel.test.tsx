/**
 * Unit tests for CompanyResearchPanel and CompanyResearchPanelBody.
 *
 * Covers the three primary UI states:
 *  1. no-research — "Run research" button visible before first run.
 *  2. loading     — skeleton shown while mutation is in-flight.
 *  3. ready       — sentiment chip + summary + flags rendered for populated record.
 *
 * RTK Query is mocked via vi.mock so no real store or HTTP calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompanyResearchPanelBody from "../CompanyResearchPanelBody";
import type { CompanyResearchMode } from "@myjobhunter/api-client/types/company/company-research-mode";
import type { CompanyResearch } from "@myjobhunter/api-client/types/company-research";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    LoadingButton: ({
      children,
      isLoading,
      onClick,
      className,
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      onClick?: () => void;
      className?: string;
    }) => (
      <button onClick={onClick} disabled={isLoading} className={className}>
        {isLoading ? "Loading..." : children}
      </button>
    ),
    Skeleton: ({ className }: { className?: string }) => (
      <div data-testid="skeleton" className={className} />
    ),
    Badge: ({ label, color }: { label: string; color: string }) => (
      <span data-testid={`badge-${color}`}>{label}</span>
    ),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_RESEARCH: CompanyResearch = {
  id: "research-uuid",
  company_id: "company-uuid",
  user_id: "user-uuid",
  overall_sentiment: "positive",
  senior_engineer_sentiment: "Engineering culture is collaborative and fast-paced.",
  interview_process: "Three rounds including a technical screen. Well-organised process.",
  description: "XYZ Corp builds workflow automation software for mid-market customers.",
  products_for_you: "Your distributed-systems experience maps to the workflow automation core.",
  red_flags: ["Promotion cycles can be slow"],
  green_flags: ["Competitive pay", "Strong engineering culture"],
  reported_comp_range_min: null,
  reported_comp_range_max: null,
  comp_currency: "USD",
  comp_confidence: "low",
  raw_synthesis: {
    compensation_signals: "Above-market base salary with equity refresh.",
  },
  last_researched_at: "2026-05-04T12:00:00Z",
  created_at: "2026-05-04T12:00:00Z",
  updated_at: "2026-05-04T12:00:00Z",
  sources: [
    {
      id: "src-1",
      company_research_id: "research-uuid",
      url: "https://glassdoor.com/reviews/xyz",
      title: "XYZ Corp Reviews",
      snippet: "Great place to work.",
      source_type: "glassdoor",
      fetched_at: "2026-05-04T12:00:00Z",
      created_at: "2026-05-04T12:00:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBody({
  mode,
  research,
  isRunning = false,
  errorMessage = null,
  onRunResearch = vi.fn(),
  canRetry = true,
}: {
  mode: CompanyResearchMode;
  research?: CompanyResearch;
  isRunning?: boolean;
  errorMessage?: string | null;
  onRunResearch?: () => void;
  canRetry?: boolean;
}) {
  return render(
    <CompanyResearchPanelBody
      mode={mode}
      research={research}
      onRunResearch={onRunResearch}
      isRunning={isRunning}
      errorMessage={errorMessage}
      canRetry={canRetry}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CompanyResearchPanelBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("no-research state", () => {
    it("renders a 'Run research' button", () => {
      renderBody({ mode: "no-research" });
      expect(screen.getByRole("button", { name: /run research/i })).toBeInTheDocument();
    });

    it("disables the button while running", () => {
      renderBody({ mode: "no-research", isRunning: true });
      const btn = screen.getByRole("button", { name: /loading/i });
      expect(btn).toBeDisabled();
    });

    it("calls onRunResearch when button is clicked", async () => {
      const onRunResearch = vi.fn();
      const user = userEvent.setup();
      renderBody({ mode: "no-research", onRunResearch });

      await user.click(screen.getByRole("button", { name: /run research/i }));

      expect(onRunResearch).toHaveBeenCalledTimes(1);
    });
  });

  describe("loading state", () => {
    it("renders skeleton elements", () => {
      renderBody({ mode: "loading" });
      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    });

    it("does not render a run button in loading state", () => {
      renderBody({ mode: "loading" });
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("ready state", () => {
    it("renders sentiment badge", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByTestId("badge-green")).toHaveTextContent("Positive");
    });

    it("renders the summary text", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByText(/Three rounds including a technical screen/)).toBeInTheDocument();
    });

    it("renders culture signals", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByText(/collaborative and fast-paced/)).toBeInTheDocument();
    });

    it("renders the company description", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByText(/workflow automation software for mid-market/)).toBeInTheDocument();
      expect(screen.getByText(/What they do/i)).toBeInTheDocument();
    });

    it("renders products_for_you when present", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByText(/distributed-systems experience maps/)).toBeInTheDocument();
      expect(screen.getByText(/Products that match your background/i)).toBeInTheDocument();
    });

    it("hides products_for_you section when null", () => {
      const noPersonal: CompanyResearch = { ...MOCK_RESEARCH, products_for_you: null };
      renderBody({ mode: "ready", research: noPersonal });
      expect(screen.queryByText(/Products that match your background/i)).not.toBeInTheDocument();
    });

    it("hides description section when null", () => {
      const noDescription: CompanyResearch = { ...MOCK_RESEARCH, description: null };
      renderBody({ mode: "ready", research: noDescription });
      expect(screen.queryByText(/What they do/i)).not.toBeInTheDocument();
    });

    it("renders green flags as a list", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByText("Competitive pay")).toBeInTheDocument();
      expect(screen.getByText("Strong engineering culture")).toBeInTheDocument();
    });

    it("renders red flags as a list", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByText("Promotion cycles can be slow")).toBeInTheDocument();
    });

    it("renders source count toggle", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByText(/1 source/)).toBeInTheDocument();
    });

    it("shows sources list when toggle is clicked", async () => {
      const user = userEvent.setup();
      renderBody({ mode: "ready", research: MOCK_RESEARCH });

      await user.click(screen.getByText(/1 source/));

      expect(screen.getByText("XYZ Corp Reviews")).toBeInTheDocument();
    });

    it("links only http and https sources, showing a javascript: or intent:// one as plain text", async () => {
      const user = userEvent.setup();
      const unsafe = (id: string, url: string, title: string | null) => ({ ...MOCK_RESEARCH.sources[0], id, url, title });
      renderBody({
        mode: "ready",
        research: {
          ...MOCK_RESEARCH,
          sources: [
            MOCK_RESEARCH.sources[0],
            unsafe("src-js", "javascript:alert(document.cookie)", "Sketchy page"),
            unsafe("src-intent", "intent://scan/#Intent;scheme=zxing;end", null),
          ],
        },
      });

      await user.click(screen.getByText(/3 sources/));

      expect(screen.getByRole("link", { name: "XYZ Corp Reviews" })).toHaveAttribute("href", "https://glassdoor.com/reviews/xyz");
      expect(screen.getByText("Sketchy page").closest("a")).toBeNull();
      expect(screen.getByText("intent://scan/#Intent;scheme=zxing;end").closest("a")).toBeNull();
      expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    it("renders a re-run button", () => {
      renderBody({ mode: "ready", research: MOCK_RESEARCH });
      expect(screen.getByRole("button", { name: /re-run/i })).toBeInTheDocument();
    });

    it("renders mixed sentiment badge correctly", () => {
      const mixed: CompanyResearch = { ...MOCK_RESEARCH, overall_sentiment: "mixed" };
      renderBody({ mode: "ready", research: mixed });
      expect(screen.getByTestId("badge-yellow")).toHaveTextContent("Mixed");
    });

    it("renders negative sentiment badge correctly", () => {
      const negative: CompanyResearch = { ...MOCK_RESEARCH, overall_sentiment: "negative" };
      renderBody({ mode: "ready", research: negative });
      expect(screen.getByTestId("badge-red")).toHaveTextContent("Negative");
    });
  });

  describe("failed state", () => {
    it("renders an error message and retry button", () => {
      renderBody({ mode: "failed", errorMessage: "503 Service Unavailable" });
      expect(screen.getByText(/503 Service Unavailable/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("says research isn't set up, with the server's reason and no Retry, when retrying can't help", () => {
      renderBody({ mode: "failed", errorMessage: "Tavily research is not configured: no key", canRetry: false });
      expect(screen.getByText(/isn't set up on the server/)).toBeInTheDocument();
      expect(screen.getByText(/Tavily research is not configured/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    });

    it("shows generic message when no specific error", () => {
      renderBody({ mode: "failed", errorMessage: null });
      expect(screen.getByText(/Research failed/i)).toBeInTheDocument();
    });
  });
});
