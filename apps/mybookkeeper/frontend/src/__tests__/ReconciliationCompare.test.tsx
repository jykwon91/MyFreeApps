import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/core/store/baseApi";
import ReconciliationWizard from "@/app/features/reconciliation/ReconciliationWizard";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@platform/core/lib/api", () => ({ default: request }));

const SOURCE: ReconciliationSource = {
  id: "1",
  organization_id: "org1",
  user_id: "u1",
  document_id: null,
  source_type: "1099_k",
  tax_year: 2024,
  issuer: "Airbnb",
  reported_amount: "1000.00",
  matched_amount: "0.00",
  discrepancy: "1000.00",
  status: "unmatched",
  created_at: "2024-01-01T00:00:00Z",
  document_file_name: null,
  property_name: null,
};

const YEAR = new Date().getFullYear() - 1;

type Args = { url: string; method?: string; params?: { tax_year?: number } };

function serve(handlers: { sources?: (year?: number) => ReconciliationSource[]; compare?: () => unknown }) {
  request.mockImplementation(async (args: Args) => {
    if (args.url === "/reconciliation/sources") return { data: (handlers.sources ?? (() => [SOURCE]))(args.params?.tax_year) };
    if (args.url === "/reconciliation/discrepancies") return { data: [] };
    if (args.url === "/reconciliation/auto-reconcile") return handlers.compare?.();
    throw new Error(`unexpected ${args.url}`);
  });
}

async function openSources(canWrite = true) {
  const onToast = vi.fn();
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReconciliationWizard onToast={onToast} canWrite={canWrite} />
      </MemoryRouter>
    </Provider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /review sources/i }));
  return onToast;
}

describe("ReconciliationWizard compare", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("compares the shown year, reports the result, and reloads the list", async () => {
    let compared = false;
    serve({
      sources: () => (compared ? [{ ...SOURCE, status: "matched", matched_amount: "1000.00", discrepancy: "0.00" }] : [SOURCE]),
      compare: () => {
        compared = true;
        return { data: { sources_checked: 1, auto_matched: 1, discrepancies: 0 } };
      },
    });
    const onToast = await openSources();

    await userEvent.click(await screen.findByRole("button", { name: "Compare with my records" }));

    await waitFor(() => expect(onToast).toHaveBeenCalledWith(`${YEAR}: 1 matched, 0 differ.`, "success"));
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/reconciliation/auto-reconcile", method: "POST", params: { tax_year: YEAR } }),
    );
    expect(await screen.findByText("Matched")).toBeInTheDocument();
  });

  it("shows dashes, not a false gap, until a form has been compared", async () => {
    serve({});
    await openSources();

    expect(await screen.findByText("Airbnb")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("$1,000.00")).toHaveLength(1);
  });

  it("explains a failed compare and leaves the button usable", async () => {
    serve({ compare: () => Promise.reject({ response: { status: 500 } }) });
    const onToast = await openSources();

    await userEvent.click(await screen.findByRole("button", { name: "Compare with my records" }));

    await waitFor(() => expect(onToast).toHaveBeenCalledWith("I couldn't compare them. Want to try again?", "error"));
    expect(await screen.findByRole("button", { name: "Compare with my records" })).toBeEnabled();
  });

  it("doesn't report finding nothing as a success", async () => {
    serve({ compare: () => ({ data: { sources_checked: 1, auto_matched: 0, discrepancies: 0 } }) });
    const onToast = await openSources();

    await userEvent.click(await screen.findByRole("button", { name: "Compare with my records" }));

    await waitFor(() => expect(onToast).toHaveBeenCalledWith(expect.stringContaining("I couldn't find matching income"), "error"));
  });

  it("locks the year and the button while comparing", async () => {
    let finish: (value: unknown) => void = () => undefined;
    serve({ compare: () => new Promise((resolve) => { finish = resolve; }) });
    await openSources();

    await userEvent.click(await screen.findByRole("button", { name: "Compare with my records" }));

    expect(await screen.findByRole("button", { name: /comparing/i })).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();
    finish({ data: { sources_checked: 1, auto_matched: 1, discrepancies: 0 } });
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
  });

  it("hides compare from read-only people", async () => {
    serve({});
    await openSources(false);

    expect(await screen.findByText("Airbnb")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compare with my records" })).not.toBeInTheDocument();
    expect(screen.queryByText(/choose compare/i)).not.toBeInTheDocument();
  });

  it("doesn't show last year's rows under a newly chosen year", async () => {
    let answer: (rows: ReconciliationSource[]) => void = () => undefined;
    request.mockImplementation((args: Args) => {
      if (args.url !== "/reconciliation/sources") return Promise.resolve({ data: [] });
      if (args.params?.tax_year === YEAR) return Promise.resolve({ data: [SOURCE] });
      return new Promise((resolve) => { answer = (rows) => resolve({ data: rows }); });
    });
    await openSources();
    expect(await screen.findByText("Airbnb")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox"), String(YEAR - 1));

    expect(screen.queryByText("Airbnb")).not.toBeInTheDocument();
    answer([]);
    expect(await screen.findByText("No reconciliation sources yet")).toBeInTheDocument();
  });

  it("doesn't say everything matches when the year has no 1099s", async () => {
    serve({ sources: () => [] });
    await openSources();
    await userEvent.click(screen.getByRole("button", { name: /discrepancies/i }));

    expect(await screen.findByText("No 1099 sources for this year yet.")).toBeInTheDocument();
    expect(screen.queryByText(/everything matches/i)).not.toBeInTheDocument();
  });
});
