import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceDashboard } from "../ServiceDashboard";
import type { Drop } from "@/types/drop/drop";
import type { DashboardSlot, ServiceDashboardPayload } from "@/types/service/service";

const DROP_A = "drop-a";
const DROP_B = "drop-b";

/** What the server has answered so far, by drop id. */
const answered = new Map<string, ServiceDashboardPayload>();
/** The last answer the fake query returned, which RTK Query keeps in `data` across argument changes. */
let lastData: ServiceDashboardPayload | undefined;

vi.mock("@/store/dropsApi", () => ({
  useListDropsQuery: () => ({
    data: [
      { id: "drop-a", name: "Alpha Drop", date: "2026-11-20" },
      { id: "drop-b", name: "Beta Drop", date: "2026-11-21" },
    ] as Drop[],
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  }),
}));

// Behaves like RTK Query: `data` keeps the previous argument's result while the
// new one loads; `currentData` is only ever the requested argument's own result.
vi.mock("@/store/serviceApi", () => ({
  useGetDashboardQuery: (dropId: string) => {
    const own = answered.get(dropId);
    if (own) lastData = own;
    return {
      data: own ?? lastData,
      currentData: own,
      isLoading: !own && !lastData,
      isFetching: !own,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("../SlotColumn", () => ({
  SlotColumn: ({ dropId, slot }: { dropId: string; slot: DashboardSlot }) => (
    <section aria-label={`slot ${slot.id}`} data-drop-id={dropId} />
  ),
}));

vi.mock("../SlotGridSkeleton", () => ({
  default: () => <div data-testid="slot-grid-skeleton" />,
}));

function dashboardOf(dropId: string, name: string, slotId: string): ServiceDashboardPayload {
  return {
    drop: { id: dropId, name, status: "active", in_progress_count: 0 },
    slots: [{ id: slotId, orders: [] }],
    server_time: new Date().toISOString(),
  } as unknown as ServiceDashboardPayload;
}

function renderDashboard(dropId: string) {
  return <ServiceDashboard dropId={dropId} onDropChange={vi.fn()} />;
}

describe("ServiceDashboard drop switching", () => {
  beforeEach(() => {
    answered.clear();
    lastData = undefined;
  });

  it("shows the skeleton, not the previous drop, while the newly chosen drop loads", () => {
    answered.set(DROP_A, dashboardOf(DROP_A, "Alpha Dashboard", "slot-a1"));
    const { rerender } = render(renderDashboard(DROP_A));
    expect(screen.getByRole("heading", { level: 1, name: "Alpha Dashboard" })).toBeInTheDocument();
    expect(screen.getByLabelText("slot slot-a1")).toHaveAttribute("data-drop-id", DROP_A);

    rerender(renderDashboard(DROP_B));

    expect(screen.queryByText("Alpha Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("slot slot-a1")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Service" })).toBeInTheDocument();
    expect(screen.getByTestId("slot-grid-skeleton")).toBeInTheDocument();
  });

  it("shows the new drop's dashboard, acting on the new drop, once it has loaded", () => {
    answered.set(DROP_A, dashboardOf(DROP_A, "Alpha Dashboard", "slot-a1"));
    const { rerender } = render(renderDashboard(DROP_A));
    rerender(renderDashboard(DROP_B));

    answered.set(DROP_B, dashboardOf(DROP_B, "Beta Dashboard", "slot-b1"));
    rerender(renderDashboard(DROP_B));

    expect(screen.getByRole("heading", { level: 1, name: "Beta Dashboard" })).toBeInTheDocument();
    expect(screen.getByLabelText("slot slot-b1")).toHaveAttribute("data-drop-id", DROP_B);
    expect(screen.queryByText("Alpha Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("slot-grid-skeleton")).not.toBeInTheDocument();
  });
});
