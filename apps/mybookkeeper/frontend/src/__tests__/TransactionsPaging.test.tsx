/**
 * The Transactions page keeps its table (rows per page, page arrows, header filters,
 * column sorting with shift-click, select all) but asks GET /transactions/page for each
 * page, so it reaches every row instead of only the newest 1,000.
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/shared/lib/api";
import { downloadFile } from "@/shared/utils/download";
import {
  adapter,
  bodiesTo,
  bulkBar,
  callsTo,
  lastPageQuery,
  PENDING_TOTAL,
  renderPage,
  resetServer,
  selectionFor,
  server,
  stopServer,
  TOTAL,
} from "@/test/transactions-page-harness";
import { deferred } from "@/test/deferred";
import type { TransactionListPage } from "@mybookkeeper/api-client/types/transaction/TransactionListPage";

vi.mock("@/shared/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

const shown = (vendor: string) => screen.queryAllByText(vendor).length > 0;

beforeEach(() => {
  resetServer();
  vi.mocked(downloadFile).mockReset();
});

afterEach(() => {
  stopServer();
});

describe("Transactions paging", () => {
  it("asks the server for page 2 and counts from the server's total", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(`1–25 of ${TOTAL}`)).toBeInTheDocument();
    expect(lastPageQuery().get("limit")).toBe("25");
    expect(lastPageQuery().get("offset")).toBe("0");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText(`26–50 of ${TOTAL}`)).toBeInTheDocument();
    expect(lastPageQuery().get("offset")).toBe("25");
    expect(shown("Row 26")).toBe(true);
    expect(shown("Row 25")).toBe(false);
  });

  it("reaches the last rows past any cap, and keeps the top row in view when rows per page change", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText(`26–50 of ${TOTAL}`);

    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50");
    expect(await screen.findByText(`1–50 of ${TOTAL}`)).toBeInTheDocument();
    expect(lastPageQuery().get("limit")).toBe("50");

    await user.click(screen.getByRole("button", { name: "Last page" }));

    expect(await screen.findByText(`101–120 of ${TOTAL}`)).toBeInTheDocument();
    expect(lastPageQuery().get("offset")).toBe("100");
    expect(shown("Row 120")).toBe(true);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("applies a multi-select header filter on the server and starts again from page 1", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText(`26–50 of ${TOTAL}`);

    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));
    await user.click(screen.getByRole("checkbox", { name: "Needs Review" }));

    expect(await screen.findByText(`1–${PENDING_TOTAL} of ${PENDING_TOTAL}`)).toBeInTheDocument();
    expect(lastPageQuery().getAll("statuses")).toEqual(["pending", "needs_review"]);
    expect(lastPageQuery().get("offset")).toBe("0");
    expect(shown("Pending 1")).toBe(true);
  });

  it("filters rows with no property through the Property header filter", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);

    await user.click(screen.getByRole("button", { name: "Filter property_id" }));
    await user.click(screen.getByRole("checkbox", { name: "(No property)" }));

    await waitFor(() => expect(lastPageQuery().getAll("property_ids")).toEqual(["unassigned"]));
  });

  it("asks the server to sort by Property and by Tax", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    expect(lastPageQuery().getAll("sort")).toEqual(["transaction_date:desc"]);

    await user.click(screen.getByRole("columnheader", { name: /Property/ }));
    await waitFor(() => expect(lastPageQuery().getAll("sort")[0]).toMatch(/^property_id:/));

    await user.click(screen.getByRole("columnheader", { name: /Tax/ }));
    await waitFor(() => expect(lastPageQuery().getAll("sort")).toHaveLength(1));
    expect(lastPageQuery().getAll("sort")[0]).toMatch(/^tax_relevant:/);
  });

  it("sends every shift-clicked column as a sort key, most significant first", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);

    await user.click(screen.getByRole("columnheader", { name: /Property/ }));
    await waitFor(() => expect(lastPageQuery().getAll("sort")[0]).toMatch(/^property_id:/));
    const propertyKey = lastPageQuery().getAll("sort")[0];
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("columnheader", { name: /Amount/ }));
    await user.keyboard("{/Shift}");

    await waitFor(() => expect(lastPageQuery().getAll("sort")).toHaveLength(2));
    const [first, second] = lastPageQuery().getAll("sort");
    expect(first).toBe(propertyKey);
    expect(second).toMatch(/^amount:(asc|desc)$/);
    expect(lastPageQuery().get("offset")).toBe("0");
  });

  it("selects every matching row across pages from the header checkbox, and unselects them again", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);

    await user.click(screen.getByRole("checkbox", { name: "Select all transactions" }));

    expect(await screen.findByText(`${TOTAL} selected`)).toBeInTheDocument();
    expect(callsTo("/transactions/selection")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText(`26–50 of ${TOTAL}`);
    expect(screen.getByRole("checkbox", { name: "Select Row 26" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select all transactions" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Select all transactions" }));

    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it("exports with the header filters and the order the table shows", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("button", { name: "Filter transaction_type" }));
    await user.click(screen.getByRole("checkbox", { name: "Expense" }));
    await waitFor(() => expect(lastPageQuery().getAll("transaction_types")).toEqual(["expense"]));

    await user.click(screen.getByText("Export"));
    await user.click(screen.getByText("Export CSV"));

    expect(downloadFile).toHaveBeenCalledWith(
      "/exports/transactions/csv?transaction_types=expense&sort=transaction_date%3Adesc",
      "transactions.csv",
    );
  });

  it("marks the table busy while the next page loads", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    api.defaults.adapter = (config) =>
      new Promise((resolve) => {
        release = () => resolve(adapter(config));
      });

    await user.click(screen.getByRole("button", { name: "Next page" }));

    const table = screen.getByRole("table").closest("[aria-busy]");
    await waitFor(() => expect(table).toHaveAttribute("aria-busy", "true"));
    await act(async () => release());
    await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
    expect(within(screen.getByRole("table")).getAllByText("Row 26").length).toBeGreaterThan(0);
  });

  it("keeps the page arrows and select all as they were while another page loads", async () => {
    const user = userEvent.setup();
    const secondPage = deferred<TransactionListPage>();
    const answer = server.pageResponse;
    server.pageResponse = (query) => (query.get("offset") === "25" ? secondPage.promise : answer(query));
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("checkbox", { name: "Select all transactions" }));
    await screen.findByText(`${TOTAL} selected`);

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect((await screen.findAllByTestId("transaction-skeleton-row")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Select all transactions" })).toBeChecked();

    await act(async () => secondPage.resolve(await answer(lastPageQuery())));
    expect(await screen.findByText(`26–50 of ${TOTAL}`)).toBeInTheDocument();
  });

  it("unticks rows a new filter hides before any bulk action can reach them", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("checkbox", { name: "Select Row 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Row 2" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    // Of the two ticked rows only Row 2 matches the Pending filter.
    server.selectionResponse = (query) =>
      new Promise((resolve) => {
        release = () => resolve(query.getAll("statuses").length ? [{ id: "Row-2", property_id: null, status: "pending" }] : selectionFor(query));
      });

    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));

    const checking = await screen.findByText("Checking selection...");
    expect(screen.queryByText("2 selected")).toBeNull();
    expect(within(bulkBar(checking)).getByRole("button", { name: /Delete/ })).toBeDisabled();
    expect(callsTo("/transactions/selection").map((query) => query.getAll("statuses"))).toEqual([["pending"]]);
    await act(async () => release());

    const count = await screen.findByText("1 selected");
    await user.keyboard("{Escape}");
    await user.click(within(bulkBar(count)).getByRole("button", { name: /Delete/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(bodiesTo("/transactions/bulk-delete")).toEqual([{ ids: ["Row-2"] }]));
  });

  it("keeps ticks across pages, page sizes and sort changes without checking them again", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("checkbox", { name: "Select Row 1" }));

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText(`26–50 of ${TOTAL}`);
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50");
    await screen.findByText(`1–50 of ${TOTAL}`);
    await user.click(screen.getByRole("columnheader", { name: /Property/ }));
    await waitFor(() => expect(lastPageQuery().getAll("sort")[0]).toMatch(/^property_id:/));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.queryByText("Checking selection...")).toBeNull();
    expect(callsTo("/transactions/selection")).toHaveLength(0);
  });
});
