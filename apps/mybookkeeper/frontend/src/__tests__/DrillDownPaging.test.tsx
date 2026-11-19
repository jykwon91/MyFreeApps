/**
 * Against the real RTK Query hook and a server stub that refuses a limit above its cap: the drill-down loads
 * past its first page one page at a time, its headline always shows the server's count and total for every
 * matching row, a failed "Load more" keeps the rows (its Retry asks for that page again), and the rows stay
 * put through a visit to a transaction's detail.
 */
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DrillDownPanel from "@/app/features/dashboard/DrillDownPanel";
import { DRILL_DOWN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/transactionPaging";
import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { restoreApi, stubApi } from "@/test/api-stub";
import { aDrillDownTransaction, answerDrillDownPage } from "@/test/drill-down-server";
import { renderWithStore } from "@/test/render-with-store";

vi.mock("@/app/features/transactions/TransactionPanel", () => ({
  default: forwardRef<{ requestClose: (after: () => void) => void }, { transaction: Transaction }>(
    function TransactionPanelStub({ transaction }, ref) {
      useImperativeHandle(ref, () => ({ requestClose: (after) => after() }));
      return <div data-testid="detail">Detail of {transaction.vendor}</div>;
    },
  ),
}));

/** More rows than two pages hold, so the last needs a third request. */
const ROW_COUNT = DRILL_DOWN_PAGE_SIZE * 2 + 30;
/** What the server says every matching row adds up to: more than any page holds. */
const SERVER_TOTAL = "2312.34";
const HEADLINE = `${ROW_COUNT} transactions — $2,312.34`;
const ROWS = Array.from({ length: ROW_COUNT }, (_, i) => aDrillDownTransaction(i));
const filter: DrillDownFilter = { category: "contract_work", label: "Contract Work" };

let offsets: number[] = [];
let failOffset: number | null = null;
let cleanup: () => void = () => undefined;

function renderPanel(): void {
  offsets = [];
  failOffset = null;
  stubApi((path, params) => {
    if (path === "/properties") return [];
    if (path !== "/transactions/page") throw new Error(`unexpected ${path}`);
    const offset = Number(params.offset);
    offsets.push(offset);
    if (offset === failOffset) throw new Error("down");
    return answerDrillDownPage(ROWS, params, SERVER_TOTAL);
  });
  cleanup = renderWithStore(<DrillDownPanel filter={filter} onClose={vi.fn()} />, "/");
}

// Text lookups, not role+name queries: computing accessible names over hundreds of rows is slow in jsdom.
const drawnRows = () => screen.getAllByText(/^Vendor \d+$/);
const loadMore = () => userEvent.click(screen.getByRole("button", { name: "Load more" }));

afterEach(() => {
  cleanup();
  restoreApi();
});

describe("DrillDownPanel paging", () => {
  it("loads a page at a time to the last row, with the server's count and total from the first page on", async () => {
    renderPanel();
    await screen.findByText("Vendor 0");
    expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE);
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();

    await loadMore();
    expect(await screen.findByText(`Vendor ${DRILL_DOWN_PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();

    await loadMore();
    expect(await screen.findByText(`Vendor ${ROW_COUNT - 1}`)).toBeInTheDocument();
    expect(drawnRows()).toHaveLength(ROW_COUNT);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(offsets).toEqual([0, DRILL_DOWN_PAGE_SIZE, DRILL_DOWN_PAGE_SIZE * 2]);
  });

  it("keeps its rows when Load more fails, and Retry asks for that page again", async () => {
    renderPanel();
    await screen.findByText("Vendor 0");
    failOffset = DRILL_DOWN_PAGE_SIZE;

    await loadMore();
    expect(await screen.findByText("I couldn't load more transactions. Want me to try again?")).toBeInTheDocument();
    expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE);
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();

    failOffset = null;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(`Vendor ${DRILL_DOWN_PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(offsets).toEqual([0, DRILL_DOWN_PAGE_SIZE, DRILL_DOWN_PAGE_SIZE]);
  });

  it("keeps the loaded rows after coming back from a page-2 row's detail", async () => {
    renderPanel();
    await screen.findByText("Vendor 0");
    await loadMore();
    await userEvent.click(await screen.findByText("Vendor 150"));
    expect(screen.getByTestId("detail")).toHaveTextContent("Vendor 150");

    await userEvent.click(screen.getByTitle("Back to list"));
    await waitFor(() => expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE * 2));
    expect(offsets).toEqual([0, DRILL_DOWN_PAGE_SIZE]);
  });

  it("opens a row from the keyboard", async () => {
    renderPanel();
    const row = (await screen.findByText("Vendor 2")).closest("button");
    expect(row).not.toBeNull();
    row?.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("detail")).toHaveTextContent("Vendor 2");
  });
});
