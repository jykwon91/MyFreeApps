/**
 * Dashboard page states: loading shows the skeleton, a failed load shows an
 * error with Retry (never the empty state), and the empty state appears only
 * after a successful load with no applications.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../Dashboard";

const query = vi.hoisted(() => vi.fn());

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useListApplicationsKanbanQuery: query,
}));
vi.mock("@/features/dashboard/DashboardSkeleton", () => ({
  default: () => <div data-testid="skeleton" />,
}));
vi.mock("@/features/applications/ApplicationDrawer", () => ({ default: () => null }));
vi.mock("@/features/kanban/KanbanBoard", async () => {
  const { default: Empty } = await import("@/features/kanban/KanbanEmptyState");
  return {
    default: ({ items, isStale }: { items: unknown[]; isStale?: boolean }) =>
      items.length === 0 ? <Empty /> : <div data-testid="board" data-stale={String(isStale)}>{items.length}</div>,
  };
});

function result(overrides: Record<string, unknown>) {
  return { data: undefined, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(), ...overrides };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard page", () => {
  beforeEach(() => query.mockReset());

  it("shows the skeleton while loading", () => {
    query.mockReturnValue(result({ isLoading: true }));
    renderPage();
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("shows an error with Retry, not the empty state, when the load fails", async () => {
    const refetch = vi.fn();
    query.mockReturnValue(result({ isError: true, refetch }));
    renderPage();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/couldn't load your board/i)).toBeInTheDocument();
    expect(screen.queryByText(/your hunt starts here/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("disables Retry while the retry is in flight", () => {
    query.mockReturnValue(result({ isError: true, isFetching: true }));
    renderPage();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows the empty state only after a successful empty load", () => {
    query.mockReturnValue(result({ data: { items: [] } }));
    renderPage();
    expect(screen.getByText(/your hunt starts here/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps showing the board, marked stale, when a background refetch fails", () => {
    query.mockReturnValue(result({ data: { items: [{ id: "1" }] }, isError: true }));
    renderPage();
    expect(screen.getByTestId("board")).toHaveAttribute("data-stale", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not mark a healthy board stale", () => {
    query.mockReturnValue(result({ data: { items: [{ id: "1" }] } }));
    renderPage();
    expect(screen.getByTestId("board")).toHaveAttribute("data-stale", "false");
  });

  it("leaves the main landmark to the app shell in the error state", () => {
    query.mockReturnValue(result({ isError: true }));
    renderPage();
    expect(screen.queryAllByRole("main")).toHaveLength(0);
  });
});
