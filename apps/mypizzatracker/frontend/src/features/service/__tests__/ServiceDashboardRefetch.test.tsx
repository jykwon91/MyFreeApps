import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceDashboard } from "../ServiceDashboard";
import type { Drop } from "@/types/drop/drop";

let drops: { data: Drop[] | undefined; isError: boolean };

vi.mock("@/store/dropsApi", () => ({
  useListDropsQuery: () => ({ ...drops, isLoading: false, error: undefined, refetch: vi.fn() }),
}));
vi.mock("@/store/serviceApi", () => ({
  useGetDashboardQuery: () => ({
    data: undefined,
    currentData: undefined,
    isLoading: false,
    isFetching: true,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  }),
}));
vi.mock("../SlotGridSkeleton", () => ({ default: () => <div data-testid="slot-grid-skeleton" /> }));

const DROP = { id: "drop-a", name: "Alpha Drop", date: "2026-11-20" } as Drop;

function renderDashboard() {
  render(<ServiceDashboard dropId="drop-a" onDropChange={vi.fn()} />);
}

describe("ServiceDashboard when the drops are refetched", () => {
  beforeEach(() => {
    drops = { data: [DROP], isError: false };
  });

  it("keeps the service view on screen when a poll of the drops fails", () => {
    drops = { data: [DROP], isError: true };
    renderDashboard();

    expect(screen.getByTestId("slot-grid-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Could not load drops")).not.toBeInTheDocument();
  });

  it("says the drops couldn't load when none ever did", () => {
    drops = { data: undefined, isError: true };
    renderDashboard();

    expect(screen.getByText("Could not load drops")).toBeInTheDocument();
  });
});
