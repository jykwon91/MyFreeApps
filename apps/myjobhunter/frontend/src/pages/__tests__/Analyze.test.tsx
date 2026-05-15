import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/ui";
import jobAnalysisReducer from "@/store/jobAnalysisSlice";
import Analyze from "@/pages/Analyze";
import type { JobAnalysis } from "@/types/job-analysis/job-analysis";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    Loader2: () => null,
    Sparkles: () => null,
    ExternalLink: () => null,
    AlertTriangle: () => null,
    CheckCircle2: () => null,
  };
});

vi.mock("@/lib/jobAnalysisApi", () => ({
  useAnalyzeJobMutation: vi.fn(),
  useApplyFromAnalysisMutation: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    LoadingButton: ({
      children,
      isLoading,
      loadingText,
      type,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      loadingText?: string;
      type?: "button" | "submit" | "reset";
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
    }) => (
      <button
        type={type ?? "button"}
        disabled={isLoading || disabled}
        onClick={onClick}
      >
        {isLoading ? loadingText : children}
      </button>
    ),
  };
});

import {
  useAnalyzeJobMutation,
  useApplyFromAnalysisMutation,
} from "@/lib/jobAnalysisApi";

const mockUseAnalyzeJobMutation = vi.mocked(useAnalyzeJobMutation);
const mockUseApplyFromAnalysisMutation = vi.mocked(useApplyFromAnalysisMutation);

// ---------------------------------------------------------------------------
// Test store factory
// ---------------------------------------------------------------------------

function makeTestStore(preloadedJobAnalysis?: { lastResult: JobAnalysis | null }) {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      jobAnalysis: jobAnalysisReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
    preloadedState: preloadedJobAnalysis
      ? { jobAnalysis: preloadedJobAnalysis }
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAnalysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    id: "an-1",
    user_id: "user-1",
    source_url: null,
    jd_text: "JD body…",
    fingerprint: "0".repeat(64),
    extracted: {
      title: "Senior Backend Engineer",
      company: "Acme",
      location: "SF",
      remote_type: "hybrid",
      posted_salary_min: 140000,
      posted_salary_max: 180000,
      posted_salary_currency: "USD",
      posted_salary_period: "year",
      summary: "Senior role.",
    },
    verdict: "worth_considering",
    verdict_summary: "Skill match strong, salary below your floor.",
    dimensions: [
      { key: "skill_match", status: "strong", rationale: "Python covered." },
      { key: "seniority", status: "aligned", rationale: "Senior matches." },
      { key: "salary", status: "below_target", rationale: "Top is $180k." },
      { key: "location_remote", status: "compatible", rationale: "Hybrid OK." },
      { key: "work_auth", status: "compatible", rationale: "OK." },
    ],
    red_flags: [],
    green_flags: ["Engineering practices listed", "Career growth budget"],
    total_tokens_in: 1234,
    total_tokens_out: 456,
    total_cost_usd: 0.01,
    applied_application_id: null,
    created_at: "2026-05-06T12:00:00Z",
    updated_at: "2026-05-06T12:00:00Z",
    ...overrides,
  };
}

interface RenderOptions {
  store?: ReturnType<typeof makeTestStore>;
}

function renderAnalyze({ store }: RenderOptions = {}) {
  const testStore = store ?? makeTestStore();
  return {
    store: testStore,
    ...render(
      <Provider store={testStore}>
        <MemoryRouter initialEntries={["/analyze"]}>
          <Routes>
            <Route path="/analyze" element={<Analyze />} />
            <Route
              path="/applications"
              element={<div data-testid="applications-page">Applications</div>}
            />
          </Routes>
        </MemoryRouter>
      </Provider>,
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Analyze page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in input mode with the URL panel focused", () => {
    mockUseAnalyzeJobMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    renderAnalyze();

    expect(screen.getByText("Analyze a job")).toBeInTheDocument();
    expect(screen.getByLabelText("Job posting URL")).toBeInTheDocument();
    // Switch link to text mode is visible.
    expect(
      screen.getByText("No URL? Paste the description text instead."),
    ).toBeInTheDocument();
  });

  it("transitions input → result on successful text analysis", async () => {
    const analyzeMock = vi.fn().mockReturnValue({
      unwrap: () => Promise.resolve(makeAnalysis()),
    });
    mockUseAnalyzeJobMutation.mockReturnValue([
      analyzeMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    const user = userEvent.setup();
    renderAnalyze();

    // Switch to text mode
    await user.click(
      screen.getByText("No URL? Paste the description text instead."),
    );

    const textarea = await screen.findByLabelText("Job description text");
    await user.type(textarea, "Senior Backend Engineer at Acme.");

    const buttons = screen.getAllByRole("button", { name: /Analyze this job/i });
    await user.click(buttons[buttons.length - 1]!);

    await waitFor(() => {
      expect(analyzeMock).toHaveBeenCalledWith({
        jd_text: "Senior Backend Engineer at Acme.",
      });
    });

    // Result view
    expect(await screen.findByText("Worth considering")).toBeInTheDocument();
    expect(
      screen.getByText("Skill match strong, salary below your floor."),
    ).toBeInTheDocument();
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
  });

  it("calls apply and navigates to /applications when 'Add to applications' clicked", async () => {
    mockUseAnalyzeJobMutation.mockReturnValue([
      vi.fn().mockReturnValue({
        unwrap: () => Promise.resolve(makeAnalysis()),
      }),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);

    const applyMock = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          id: "app-1",
          user_id: "user-1",
          company_id: "co-1",
          role_title: "Senior",
          url: null,
        }),
    });
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      applyMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    const user = userEvent.setup();
    renderAnalyze();

    // Drive to result via text path
    await user.click(
      screen.getByText("No URL? Paste the description text instead."),
    );
    await user.type(
      await screen.findByLabelText("Job description text"),
      "Some JD.",
    );
    const submitButtons = screen.getAllByRole("button", {
      name: /Analyze this job/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]!);

    await screen.findByText("Worth considering");

    // Click "Add to applications"
    await user.click(
      screen.getByRole("button", { name: /Add to applications/i }),
    );

    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledWith("an-1");
    });
    expect(await screen.findByTestId("applications-page")).toBeInTheDocument();
  });

  it("returns to input mode when 'Analyze another' clicked from result", async () => {
    mockUseAnalyzeJobMutation.mockReturnValue([
      vi.fn().mockReturnValue({
        unwrap: () => Promise.resolve(makeAnalysis()),
      }),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    const user = userEvent.setup();
    renderAnalyze();

    await user.click(
      screen.getByText("No URL? Paste the description text instead."),
    );
    await user.type(
      await screen.findByLabelText("Job description text"),
      "Some JD.",
    );
    const submitButtons = screen.getAllByRole("button", {
      name: /Analyze this job/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]!);

    await screen.findByText("Worth considering");

    await user.click(screen.getByRole("button", { name: /Analyze another/i }));

    // Back to input
    expect(await screen.findByLabelText("Job posting URL")).toBeInTheDocument();
  });

  it("shows the 'saved — view applications' affordance for an analysis that's already applied", async () => {
    const analyzeMock = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve(
          makeAnalysis({ applied_application_id: "app-existing" }),
        ),
    });
    mockUseAnalyzeJobMutation.mockReturnValue([
      analyzeMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    const user = userEvent.setup();
    renderAnalyze();

    await user.click(
      screen.getByText("No URL? Paste the description text instead."),
    );
    await user.type(
      await screen.findByLabelText("Job description text"),
      "Some JD.",
    );
    const submitButtons = screen.getAllByRole("button", {
      name: /Analyze this job/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]!);

    expect(await screen.findByText(/Saved to your applications/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /View applications/i }),
    ).toBeInTheDocument();
    // Primary "Add to applications" should NOT render when already saved.
    expect(
      screen.queryByRole("button", { name: /Add to applications/i }),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Slice persistence tests (new)
  // ---------------------------------------------------------------------------

  it("re-hydrates result view from slice on remount — no flash of input", () => {
    // Arrange: pre-populate the store with a completed analysis.
    const store = makeTestStore({ lastResult: makeAnalysis() });
    mockUseAnalyzeJobMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    // Mount Analyze with the pre-populated store (simulates returning after
    // navigation away).
    renderAnalyze({ store });

    // Should render the result immediately — no input view visible.
    expect(screen.queryByText("Analyze a job")).not.toBeInTheDocument();
    expect(screen.getByText("Worth considering")).toBeInTheDocument();
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
  });

  it("slice is cleared on 'Analyze another' so remount shows input", async () => {
    const store = makeTestStore({ lastResult: makeAnalysis() });
    mockUseAnalyzeJobMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    const user = userEvent.setup();
    renderAnalyze({ store });

    // Starts in result view (pre-hydrated).
    expect(screen.getByText("Worth considering")).toBeInTheDocument();

    // Click "Analyze another" — should clear the slice.
    await user.click(screen.getByRole("button", { name: /Analyze another/i }));

    // Slice should now be null.
    const sliceState = store.getState().jobAnalysis;
    expect(sliceState.lastResult).toBeNull();

    // Page should show input.
    expect(await screen.findByLabelText("Job posting URL")).toBeInTheDocument();
  });

  it("slice is populated after a successful analysis", async () => {
    const analysis = makeAnalysis();
    const analyzeMock = vi.fn().mockReturnValue({
      unwrap: () => Promise.resolve(analysis),
    });
    mockUseAnalyzeJobMutation.mockReturnValue([
      analyzeMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    const user = userEvent.setup();
    const { store } = renderAnalyze();

    await user.click(
      screen.getByText("No URL? Paste the description text instead."),
    );
    await user.type(
      await screen.findByLabelText("Job description text"),
      "Some JD.",
    );
    const submitButtons = screen.getAllByRole("button", {
      name: /Analyze this job/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]!);

    await screen.findByText("Worth considering");

    // Slice should now hold the result.
    const sliceState = store.getState().jobAnalysis;
    expect(sliceState.lastResult).not.toBeNull();
    expect(sliceState.lastResult?.id).toBe("an-1");
  });

  it("shows bridging copy framing the next step before applying", async () => {
    const analyzeMock = vi.fn().mockReturnValue({
      unwrap: () => Promise.resolve(makeAnalysis()),
    });
    mockUseAnalyzeJobMutation.mockReturnValue([
      analyzeMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    const user = userEvent.setup();
    renderAnalyze();

    await user.click(
      screen.getByText("No URL? Paste the description text instead."),
    );
    await user.type(
      await screen.findByLabelText("Job description text"),
      "Some JD.",
    );
    const submitButtons = screen.getAllByRole("button", {
      name: /Analyze this job/i,
    });
    await user.click(submitButtons[submitButtons.length - 1]!);

    await screen.findByText("Worth considering");

    // Bridging copy should be visible before applying.
    expect(
      screen.getByText(
        /Add to applications to track interviews, contacts, and documents/i,
      ),
    ).toBeInTheDocument();
  });

  it("bridging copy is absent once the analysis has been applied", async () => {
    // Pre-populate store with an already-applied analysis.
    const store = makeTestStore({
      lastResult: makeAnalysis({ applied_application_id: "app-existing" }),
    });
    mockUseAnalyzeJobMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useAnalyzeJobMutation>);
    mockUseApplyFromAnalysisMutation.mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useApplyFromAnalysisMutation>);

    renderAnalyze({ store });

    // "Saved to your applications." is shown instead of bridging copy.
    expect(await screen.findByText(/Saved to your applications/i)).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Add to applications to track interviews/i,
      ),
    ).not.toBeInTheDocument();
  });
});
