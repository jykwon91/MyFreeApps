import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Financials from "../Financials";
import type { Drop } from "@/types/drop/drop";

const DROP = { id: "tonight", date: "2026-11-14", name: "Tonight", status: "active" } as Drop;
let drops: { data: Drop[] | undefined; isError: boolean };

vi.mock("@/store/dropsApi", () => ({
  useListDropsQuery: () => ({ ...drops, error: undefined, refetch: vi.fn() }),
}));
vi.mock("@/features/financials/FinancialsBody", () => ({
  default: () => <div data-testid="financials-body" />,
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/financials?drop_id=tonight"]}>
      <Financials />
    </MemoryRouter>,
  );
}

describe("Financials when the drops are refetched", () => {
  beforeEach(() => {
    drops = { data: [DROP], isError: false };
  });

  it("keeps the page on screen when a refetch fails", () => {
    drops = { data: [DROP], isError: true };
    renderPage();

    expect(screen.getByTestId("financials-body")).toBeInTheDocument();
    expect(screen.queryByText("Could not load drops")).not.toBeInTheDocument();
  });

  it("says the drops couldn't load when none ever did", () => {
    drops = { data: undefined, isError: true };
    renderPage();

    expect(screen.getByText("Could not load drops")).toBeInTheDocument();
  });
});
