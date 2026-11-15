/**
 * Ticked rows that an edit moves out of the filters, or that bulk Approve pushes out of a
 * status filter, are unticked before any bulk action can reach them: every refetch of the
 * same page after a mutation checks the ticks against GET /transactions/selection again.
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transactionsApi } from "@mybookkeeper/api-client/store/transactionsApi";
import { bodiesTo, bulkBar, callsTo, lastPageQuery, PENDING_TOTAL, renderPage, resetServer, server, stopServer, TOTAL } from "@/test/transactions-page-harness";

vi.mock("@/shared/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

beforeEach(() => {
  resetServer();
});

afterEach(() => {
  stopServer();
});

describe("Transactions ticks after edits", () => {
  it("unticks rows bulk Approve moves out of a Pending filter, so a delete can't reach them", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));
    await screen.findByText(`1–${PENDING_TOTAL} of ${PENDING_TOTAL}`);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("checkbox", { name: "Select Pending 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Pending 2" }));
    const count = screen.getByText("2 selected");

    await user.click(within(bulkBar(count)).getByRole("button", { name: /Approve/ }));

    await waitFor(() => expect(bodiesTo("/transactions/bulk-approve")).toEqual([{ ids: ["Pending-1", "Pending-2"] }]));
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
    expect(screen.queryByText("Checking selection...")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete \d|^Delete$/ })).toBeNull();
    expect(bodiesTo("/transactions/bulk-delete")).toEqual([]);
  });

  it("unticks a row an edit moves out of the Category filter, and bulk delete leaves it alone", async () => {
    const user = userEvent.setup();
    const store = renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("button", { name: "Filter category" }));
    await user.click(screen.getByRole("checkbox", { name: "Repairs" }));
    await waitFor(() => expect(lastPageQuery().getAll("categories")).toEqual(["repairs"]));
    await user.keyboard("{Escape}");
    // The filtered rows replace the unfiltered ones once they arrive; none are shown in between.
    await user.click(await screen.findByRole("checkbox", { name: "Select Row 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Row 2" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // What the transaction panel sends when the category is changed to Utilities.
    await act(async () => {
      await store.dispatch(transactionsApi.endpoints.updateTransaction.initiate({ id: "Row-1", data: { category: "utilities" } }));
    });

    const count = await screen.findByText("1 selected");
    expect(callsTo("/transactions/selection").map((query) => query.getAll("categories"))).toEqual([["repairs"]]);
    await user.click(within(bulkBar(count)).getByRole("button", { name: /Delete/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(bodiesTo("/transactions/bulk-delete")).toEqual([{ ids: ["Row-2"] }]));
  });

  it("unticks a row Keep on Duplicates deletes, so bulk delete only sends live ids", async () => {
    const user = userEvent.setup();
    const store = renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("checkbox", { name: "Select Row 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Row 2" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // What Duplicates sends when Row 2 is kept and Row 1 deleted.
    await act(async () => {
      await store.dispatch(transactionsApi.endpoints.keepDuplicate.initiate({ keep_id: "Row-2", delete_ids: ["Row-1"] }));
    });

    const count = await screen.findByText("1 selected");
    await user.click(within(bulkBar(count)).getByRole("button", { name: /Delete/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(bodiesTo("/transactions/bulk-delete")).toEqual([{ ids: ["Row-2"] }]));
  });

  it("waits for the check before a bulk action while an edit's refetch is on its way", async () => {
    const user = userEvent.setup();
    const store = renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("checkbox", { name: "Select Row 1" }));
    let release: () => void = () => {};
    server.selectionResponse = () => new Promise((resolve) => (release = () => resolve([])));

    await act(async () => {
      await store.dispatch(transactionsApi.endpoints.updateTransaction.initiate({ id: "Row-1", data: { category: "utilities" } }));
    });

    const checking = await screen.findByText("Checking selection...");
    expect(within(bulkBar(checking)).getByRole("button", { name: /Delete/ })).toBeDisabled();
    await waitFor(() => expect(callsTo("/transactions/selection")).toHaveLength(1));
    await act(async () => release());
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
  });

  it("fetches the selection only when asked, not again after every edit", async () => {
    const user = userEvent.setup();
    const store = renderPage();
    await screen.findByText(`1–25 of ${TOTAL}`);
    await user.click(screen.getByRole("checkbox", { name: "Select all transactions" }));
    const count = await screen.findByText(`${TOTAL} selected`);
    await user.click(within(bulkBar(count)).getByRole("button", { name: "Clear selection" }));
    expect(callsTo("/transactions/selection")).toHaveLength(1);
    const pageRequests = callsTo("/transactions/page").length;

    await act(async () => {
      await store.dispatch(transactionsApi.endpoints.updateTransaction.initiate({ id: "Row-3", data: { category: "utilities" } }));
    });

    await waitFor(() => expect(callsTo("/transactions/page").length).toBeGreaterThan(pageRequests));
    expect(callsTo("/transactions/selection")).toHaveLength(1);
  });
});
