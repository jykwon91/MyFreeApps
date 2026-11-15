/**
 * A Transactions filter that is still loading, or failed, never shows the previous filter's rows or
 * total: the body holds placeholder rows while it loads, and an error with a retry after it failed.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage, resetServer, server, stopServer, TOTAL } from "@/test/transactions-page-harness";
import { deferred } from "@/test/deferred";
import type { TransactionListPage } from "@mybookkeeper/api-client/types/transaction/TransactionListPage";
import { TRANSACTIONS_LOAD_FAILED } from "@/shared/lib/transaction-list-messages";

vi.mock("@/shared/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

const shown = (vendor: string) => screen.queryAllByText(vendor).length > 0;

beforeEach(() => {
  resetServer();
});

afterEach(() => {
  stopServer();
});

describe("Transactions after a filter change", () => {
  it("shows placeholder rows while the filter loads, then the error with none of the previous rows or total", async () => {
    const user = userEvent.setup();
    const filtered = deferred<TransactionListPage>();
    const unfiltered = server.pageResponse;
    server.pageResponse = (query) => (query.getAll("statuses").length > 0 ? filtered.promise : unfiltered(query));
    renderPage();
    expect(await screen.findByText(`1–25 of ${TOTAL}`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));

    expect((await screen.findAllByTestId("transaction-skeleton-row")).length).toBeGreaterThan(0);
    expect(shown("Row 1")).toBe(false);
    expect(screen.queryByText(`1–25 of ${TOTAL}`)).not.toBeInTheDocument();

    filtered.reject(new Error("server down"));

    expect(await screen.findByText(TRANSACTIONS_LOAD_FAILED)).toBeInTheDocument();
    expect(shown("Row 1")).toBe(false);
    expect(screen.queryByText(`1–25 of ${TOTAL}`)).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("transaction-skeleton-row")).toHaveLength(0);
    expect(screen.queryByText("No transactions found")).not.toBeInTheDocument();
  });

  it("loads the filter's rows when Retry succeeds", async () => {
    const user = userEvent.setup();
    let failing = true;
    const answer = server.pageResponse;
    server.pageResponse = async (query) => {
      if (failing && query.getAll("statuses").length > 0) throw new Error("server down");
      return answer(query);
    };
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);

    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));
    expect(await screen.findByText(TRANSACTIONS_LOAD_FAILED)).toBeInTheDocument();

    failing = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("1–2 of 2")).toBeInTheDocument();
    expect(shown("Pending 1")).toBe(true);
    expect(screen.queryByText(TRANSACTIONS_LOAD_FAILED)).not.toBeInTheDocument();
  });
});
