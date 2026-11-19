/**
 * The drill-down panel against the real RTK Query hook and a stubbed server: what it asks GET /transactions/page
 * for, the server's count and total in its headline, and its loading, empty and error states.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DrillDownPanel from "@/app/features/dashboard/DrillDownPanel";
import { DRILL_DOWN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/transactionPaging";
import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionListPage } from "@mybookkeeper/api-client/types/transaction/TransactionListPage";
import { UNASSIGNED_PROPERTY_ID } from "@/shared/lib/constants";
import { restoreApi, stubApi } from "@/test/api-stub";
import { deferred } from "@/test/deferred";
import { aDrillDownTransaction, answerDrillDownPage } from "@/test/drill-down-server";
import { renderWithStore } from "@/test/render-with-store";

const filter: DrillDownFilter = {
  category: "contract_work",
  startDate: "2024-06-01",
  endDate: "2024-06-30",
  label: "Contract Work — June 2024",
};
const EMPTY_STATE = "No transactions found for this period.";
const LOAD_ERROR = "Couldn't load these transactions.";
const PROPERTIES_ERROR = "Couldn't load your properties, so property names may be missing.";

interface ServerOptions {
  rows?: readonly Transaction[];
  amountTotal?: string;
  /** Answers GET /transactions/page in place of the rows: a rejection answers with a 500. */
  page?: () => Promise<TransactionListPage>;
  propertiesFail?: boolean;
}

/** Every query GET /transactions/page was sent, in order. */
let pageQueries: URLSearchParams[] = [];
let propertiesCalls = 0;
let cleanup: () => void = () => undefined;

function renderPanel(drillFilter: DrillDownFilter, { rows = [], amountTotal = "0.00", page, propertiesFail = false }: ServerOptions = {}) {
  pageQueries = [];
  propertiesCalls = 0;
  stubApi((path, params, query) => {
    if (path === "/properties") {
      propertiesCalls += 1;
      if (propertiesFail) throw new Error("properties down");
      return [];
    }
    if (path !== "/transactions/page") throw new Error(`unexpected ${path}`);
    pageQueries.push(query);
    return page ? page() : answerDrillDownPage(rows, params, amountTotal);
  });
  cleanup = renderWithStore(<DrillDownPanel filter={drillFilter} onClose={vi.fn()} />, "/");
}

afterEach(() => {
  cleanup();
  restoreApi();
});

describe("DrillDownPanel", () => {
  it("shows the label, the rows, and the server's count and total", async () => {
    renderPanel(filter, {
      rows: [aDrillDownTransaction(1, { vendor: "Test Plumber" }), aDrillDownTransaction(2, { vendor: "Electrician Co" })],
      amountTotal: "1000.00",
    });

    expect(await screen.findByText("Test Plumber")).toBeInTheDocument();
    expect(screen.getByText("Electrician Co")).toBeInTheDocument();
    expect(screen.getByText("Contract Work — June 2024")).toBeInTheDocument();
    expect(screen.getByText("2 transactions — $1,000.00")).toBeInTheDocument();
  });

  it("shows neither the empty state nor a count or total while loading", async () => {
    const never = deferred<TransactionListPage>();
    renderPanel(filter, { page: () => never.promise });

    await waitFor(() => expect(pageQueries).toHaveLength(1));
    expect(screen.getByText("Contract Work — June 2024")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument();
    expect(screen.queryByText(/transactions? —/)).not.toBeInTheDocument();
  });

  it("shows the empty state, with a zero headline, when nothing matches", async () => {
    renderPanel(filter);

    expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument();
    expect(screen.getByText("0 transactions — $0.00")).toBeInTheDocument();
  });

  it("asks the server, a page at a time, for the summary's own rows", async () => {
    renderPanel({ label: "Revenue", type: "revenue", startDate: "2024-06-01", endDate: "2024-06-30" });

    await screen.findByText(EMPTY_STATE);
    const query = pageQueries[0];
    expect(query.get("summary_kind")).toBe("revenue");
    expect(query.get("status")).toBe("approved");
    expect(query.get("active_properties_only")).toBe("true");
    expect(query.get("start_date")).toBe("2024-06-01");
    expect(query.get("end_date")).toBe("2024-06-30");
    expect(query.get("limit")).toBe(String(DRILL_DOWN_PAGE_SIZE));
    expect(query.get("offset")).toBe("0");
  });

  it("sends the chosen properties and categories to the server rather than filtering loaded rows", async () => {
    renderPanel({ label: "Expenses", type: "expenses", propertyIds: ["prop-1", "prop-3"], categories: ["utilities"] }, {
      rows: [aDrillDownTransaction(1, { vendor: "Plumber A" })],
      amountTotal: "10.00",
    });

    expect(await screen.findByText("Plumber A")).toBeInTheDocument();
    expect(pageQueries[0].getAll("property_ids")).toEqual(["prop-1", "prop-3"]);
    expect(pageQueries[0].getAll("categories")).toEqual(["utilities"]);
    expect(screen.getByText("1 transaction — $10.00")).toBeInTheDocument();
  });

  it("routes the Unassigned bucket to the unassigned filter, with no property id or allowlist", async () => {
    renderPanel(
      { propertyId: UNASSIGNED_PROPERTY_ID, propertyIds: ["prop-1", "prop-2"], type: "revenue", label: "Unassigned — Revenue" },
      { rows: [aDrillDownTransaction(1, { vendor: "Unattributed Airbnb", property_id: null })], amountTotal: "10.00" },
    );

    expect(await screen.findByText("Unattributed Airbnb")).toBeInTheDocument();
    expect(pageQueries[0].get("unassigned")).toBe("true");
    expect(pageQueries[0].has("property_id")).toBe(false);
    expect(pageQueries[0].has("property_ids")).toBe(false);
  });

  it("passes a real property id through and leaves unassigned unset", async () => {
    renderPanel({ propertyId: "prop-42", type: "revenue", label: "6734 Peerless — Revenue" });

    await screen.findByText(EMPTY_STATE);
    expect(pageQueries[0].get("property_id")).toBe("prop-42");
    expect(pageQueries[0].has("unassigned")).toBe(false);
  });

  it("shows an error with Retry, not a $0 empty result, when the load fails", async () => {
    renderPanel(filter, { page: () => Promise.reject(new Error("down")) });

    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/transactions? —/)).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument();
  });

  it("Retry asks again, keeps the error up with Retrying... while it's in flight, then shows the rows", async () => {
    const retry = deferred<TransactionListPage>();
    let calls = 0;
    renderPanel(filter, {
      page: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error("down")) : retry.promise;
      },
    });

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /Retrying/ })).toBeDisabled();
    expect(screen.getByText(LOAD_ERROR)).toBeInTheDocument();

    retry.resolve(answerDrillDownPage([aDrillDownTransaction(1, { vendor: "Test Plumber" })], { limit: DRILL_DOWN_PAGE_SIZE, offset: 0 }, "10.00"));
    expect(await screen.findByText("Test Plumber")).toBeInTheDocument();
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("warns that property names may be missing when the properties load fails, and Retry asks again", async () => {
    renderPanel(filter, { rows: [aDrillDownTransaction(1, { vendor: "Test Plumber" })], amountTotal: "10.00", propertiesFail: true });

    expect(await screen.findByText(PROPERTIES_ERROR)).toBeInTheDocument();
    expect(screen.getByText("Test Plumber")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(propertiesCalls).toBe(2));
  });
});
