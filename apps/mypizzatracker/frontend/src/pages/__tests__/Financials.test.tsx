import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Financials from "../Financials";
import type { Drop } from "@/types/drop/drop";

function makeDrop(overrides: Partial<Drop>): Drop {
  return {
    id: "d",
    date: "2026-11-14",
    name: "Drop",
    slot_window_start: "11:00:00",
    slot_window_end: "15:00:00",
    status: "planning",
    tip_total: "0.00",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    slots: [],
    ...overrides,
  };
}

// Newest first, as the backend sorts them: next week's planned drop, then tonight's.
const drops: Drop[] = [
  makeDrop({ id: "next-week", date: "2026-11-21", name: "Next week" }),
  makeDrop({ id: "tonight", date: "2026-11-14", name: "Tonight", status: "active" }),
];

vi.mock("@/store/dropsApi", () => ({
  useListDropsQuery: () => ({ data: drops, isError: false, error: undefined, refetch: vi.fn() }),
}));

vi.mock("@/features/financials/FinancialsBody", () => ({
  default: ({ dropId }: { dropId: string }) => <div data-testid="financials-body">{dropId}</div>,
}));

describe("Financials default drop", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "America/Chicago");
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("opens on tonight's active drop on a US evening", () => {
    // 8pm on Nov 14 in Chicago is already Nov 15 in UTC.
    vi.setSystemTime(new Date("2026-11-15T02:00:00Z"));
    render(
      <MemoryRouter initialEntries={["/financials"]}>
        <Financials />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Select drop")).toHaveValue("tonight");
    expect(screen.getByTestId("financials-body")).toHaveTextContent("tonight");
  });
});
