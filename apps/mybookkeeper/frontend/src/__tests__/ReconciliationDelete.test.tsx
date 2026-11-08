import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/core/store/baseApi";
import { showError, showSuccess } from "@platform/ui";
import ReconciliationWizard from "@/app/features/reconciliation/ReconciliationWizard";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@platform/core/lib/api", () => ({ default: request }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const SOURCE: ReconciliationSource = {
  id: "s1",
  organization_id: "org1",
  user_id: "u1",
  document_id: null,
  source_type: "1099_k",
  tax_year: 2024,
  issuer: "Typo Inc",
  reported_amount: "1000.00",
  matched_amount: "0.00",
  discrepancy: "1000.00",
  status: "unmatched",
  created_at: "2024-01-01T00:00:00Z",
  document_file_name: null,
  property_name: null,
};

type Args = { url: string; method?: string };

function serve(onDelete: () => Promise<unknown>) {
  let deleted = false;
  request.mockImplementation(async (args: Args) => {
    if (args.url === "/reconciliation/sources") return { data: deleted ? [] : [SOURCE] };
    if (args.url === "/reconciliation/discrepancies") return { data: [] };
    if (args.url === "/reconciliation/sources/s1" && args.method === "DELETE") {
      const result = await onDelete();
      deleted = true;
      return result;
    }
    throw new Error(`unexpected ${args.method} ${args.url}`);
  });
}

async function openSources(canWrite = true) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReconciliationWizard onToast={vi.fn()} canWrite={canWrite} />
      </MemoryRouter>
    </Provider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /review sources/i }));
  await screen.findByText("Typo Inc");
}

function deleteCalls() {
  return request.mock.calls.filter(([args]) => (args as Args).method === "DELETE");
}

describe("deleting a reconciliation source", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(showSuccess).mockReset();
    vi.mocked(showError).mockReset();
  });

  it("asks first, then deletes the 1099 and drops it from the list", async () => {
    serve(async () => ({ data: "" }));
    await openSources();

    await userEvent.click(screen.getByRole("button", { name: "Delete the 1099 from Typo Inc" }));
    expect(deleteCalls()).toHaveLength(0);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this 1099?")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Deleted that 1099."));
    expect(deleteCalls()).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText("Typo Inc")).not.toBeInTheDocument());
  });

  it("does nothing when the host cancels", async () => {
    serve(async () => ({ data: "" }));
    await openSources();

    await userEvent.click(screen.getByRole("button", { name: "Delete the 1099 from Typo Inc" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteCalls()).toHaveLength(0);
    expect(screen.getByText("Typo Inc")).toBeInTheDocument();
  });

  it("says so when the delete fails and keeps the row", async () => {
    serve(() => Promise.reject({ response: { status: 500 } }));
    await openSources();

    await userEvent.click(screen.getByRole("button", { name: "Delete the 1099 from Typo Inc" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith("I couldn't delete that 1099. Want to try again?"));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("Typo Inc")).toBeInTheDocument();
  });

  it("doesn't offer delete to read-only people", async () => {
    serve(async () => ({ data: "" }));
    await openSources(false);

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
