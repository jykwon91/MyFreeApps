/** Ticking rows on the Transactions table: the whole cell is the target, and shift-click ticks a range. */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage, resetServer, stopServer, TOTAL } from "@/test/transactions-page-harness";
import { RANGE_SELECT_HINT } from "@/shared/lib/transaction-list-messages";
import { idsBetween } from "@/shared/utils/rowRange";

vi.mock("@/shared/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

const box = (n: number) => screen.getByRole("checkbox", { name: `Select Row ${n}` });

async function showPage() {
  renderPage();
  await screen.findByText(`1–25 of ${TOTAL}`);
}

describe("idsBetween", () => {
  const ids = ["a", "b", "c", "d"];

  it("runs from the anchor to the target, in either direction", () => {
    expect(idsBetween(ids, "b", "d")).toEqual(["b", "c", "d"]);
    expect(idsBetween(ids, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("is just the target when the anchor is on another page", () => {
    expect(idsBetween(ids, "z", "c")).toEqual(["c"]);
  });
});

describe("Selecting transaction rows", () => {
  beforeEach(() => {
    resetServer();
  });

  afterEach(() => {
    stopServer();
  });

  it("ticks the row from a click beside the box, without opening it", async () => {
    const user = userEvent.setup();
    await showPage();

    await user.click(box(2).closest("label") as HTMLElement);

    expect(box(2)).toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText(RANGE_SELECT_HINT)).toBeInTheDocument();
  });

  it("gives the box a target at least 44px tall", async () => {
    await showPage();
    expect(box(1).closest("label")).toHaveClass("min-h-[44px]");
    expect(box(1)).toHaveClass("h-5", "w-5");
  });

  it("shift-click ticks every row between the two", async () => {
    const user = userEvent.setup();
    await showPage();

    await user.click(box(2));
    await user.keyboard("{Shift>}");
    await user.click(box(6));
    await user.keyboard("{/Shift}");

    for (const n of [2, 3, 4, 5, 6]) expect(box(n)).toBeChecked();
    expect(box(1)).not.toBeChecked();
    expect(box(7)).not.toBeChecked();
    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });

  it("shift-click works upward and can untick a range", async () => {
    const user = userEvent.setup();
    await showPage();

    await user.click(box(6));
    await user.keyboard("{Shift>}");
    await user.click(box(3));
    await user.keyboard("{/Shift}");
    expect(screen.getByText("4 selected")).toBeInTheDocument();

    await user.click(box(4));
    await user.keyboard("{Shift>}");
    await user.click(box(3));
    await user.keyboard("{/Shift}");

    expect(box(3)).not.toBeChecked();
    expect(box(4)).not.toBeChecked();
    expect(within(box(5).closest("tr") as HTMLElement).getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("a plain click ticks only that row", async () => {
    const user = userEvent.setup();
    await showPage();

    await user.click(box(2));
    await user.click(box(6));

    expect(box(4)).not.toBeChecked();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });
});
