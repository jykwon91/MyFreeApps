/**
 * Unit tests for the WelcomeManuals list page.
 *
 * Verifies:
 *   - Loading skeleton while query is in-flight.
 *   - Error state with retry.
 *   - Empty state with "Create your first guide" CTA.
 *   - List renders titles + a pluralized section-count badge ("0 sections"
 *     shown distinctly).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import WelcomeManuals from "@/app/pages/WelcomeManuals";
import type { WelcomeManualSummary } from "@/shared/types/welcome-manual/welcome-manual-summary";

const mockRefetch = vi.fn();
let mockIsLoading = false;
let mockIsError = false;
let mockManuals: WelcomeManualSummary[] = [];

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useGetWelcomeManualsQuery: vi.fn(() => ({
    data: { items: mockManuals, total: mockManuals.length, has_more: false },
    isLoading: mockIsLoading,
    isError: mockIsError,
    isFetching: false,
    refetch: mockRefetch,
  })),
  useCreateWelcomeManualMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [] })),
}));

function makeSummary(overrides: Partial<WelcomeManualSummary>): WelcomeManualSummary {
  return {
    id: "m-1",
    title: "Lakeview Welcome Guide",
    property_id: null,
    section_count: 5,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function renderList() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <WelcomeManuals />
      </MemoryRouter>
    </Provider>,
  );
}

describe("WelcomeManuals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockManuals = [];
  });

  it("renders the skeleton while loading", () => {
    mockIsLoading = true;
    renderList();
    expect(screen.getByTestId("welcome-manuals-skeleton")).toBeInTheDocument();
  });

  it("renders the empty state with a create CTA when there are no manuals", () => {
    renderList();
    expect(screen.getByText(/No welcome manuals yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Create your first guide/i)).toBeInTheDocument();
  });

  it("renders an error + retry on query error", () => {
    mockIsError = true;
    renderList();
    expect(screen.getByText(/I couldn't load your welcome manuals/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders manuals with a pluralized section-count badge", () => {
    mockManuals = [
      makeSummary({ id: "m-1", title: "Guide A", section_count: 5 }),
      makeSummary({ id: "m-2", title: "Guide B", section_count: 0 }),
    ];
    renderList();
    expect(screen.getAllByText("Guide A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Guide B").length).toBeGreaterThan(0);
    // "0 sections" shown distinctly for the empty manual.
    expect(screen.getAllByText("0 sections").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 sections").length).toBeGreaterThan(0);
  });
});
