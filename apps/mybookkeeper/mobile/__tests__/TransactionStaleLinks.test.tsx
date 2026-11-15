import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { SAVED_VENDOR_MESSAGES } from "../src/constants/transactionFieldLabels";
import TransactionSavedVendorFact from "../src/features/transactions/TransactionSavedVendorFact";
import TransactionTenantLink from "../src/features/transactions/TransactionTenantLink";
import { store } from "../src/lib/store";
import { aTransaction } from "../test-support/transactionsServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: () => false }));

const originalAdapter = api.defaults.adapter;

type Reply = { status: number; data: unknown };

/** Answers vendor and applicant reads from `replies`, holding any id listed in `held` until it is released. */
function serve(replies: Record<string, Reply>, held: Set<string>) {
  const releases: Record<string, () => void> = {};
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const url = config.url ?? "";
    if (held.has(url)) await new Promise<void>((resolve) => { releases[url] = resolve; });
    const reply = replies[url] ?? { status: 404, data: { detail: "not found" } };
    const response = { data: reply.data, status: reply.status, statusText: "", headers: {}, config } as never;
    if (reply.status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
    return response;
  };
  api.defaults.adapter = adapter;
  return releases;
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{children}</ToastProvider>
    </Provider>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function income(applicantId: string): Transaction {
  return aTransaction({ id: "t1", transaction_type: "income", applicant_id: applicantId, attribution_source: null });
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("moving to the next transaction in place", () => {
  it("never shows the previous saved vendor while the next one loads", async () => {
    const releases = serve({ "/vendors/vA": { status: 200, data: { id: "vA", name: "Ace Plumbing" } }, "/vendors/vB": { status: 200, data: { id: "vB", name: "Bolt Electric" } } }, new Set(["/vendors/vB"]));
    const view = await render(<TransactionSavedVendorFact vendorId="vA" />, { wrapper: Screen });
    await settle();
    expect(screen.getByText("Ace Plumbing")).toBeTruthy();

    await view.rerender(<TransactionSavedVendorFact vendorId="vB" />);
    expect(screen.queryByText("Ace Plumbing")).toBeNull();
    expect(screen.getByText(SAVED_VENDOR_MESSAGES.unknown)).toBeTruthy();

    await act(async () => releases["/vendors/vB"]());
    await settle();
    expect(screen.getByText("Bolt Electric")).toBeTruthy();
  });

  it("shows the unknown vendor, not the previous one, when the next vendor is gone", async () => {
    serve({ "/vendors/vA": { status: 200, data: { id: "vA", name: "Ace Plumbing" } } }, new Set());
    const view = await render(<TransactionSavedVendorFact vendorId="vA" />, { wrapper: Screen });
    await settle();
    expect(screen.getByText("Ace Plumbing")).toBeTruthy();

    await view.rerender(<TransactionSavedVendorFact vendorId="vB" />);
    await settle();
    expect(screen.queryByText("Ace Plumbing")).toBeNull();
    expect(screen.getByText(SAVED_VENDOR_MESSAGES.unknown)).toBeTruthy();
  });

  it("never shows the previous tenant while the next one loads", async () => {
    const releases = serve({ "/applicants/aA": { status: 200, data: { id: "aA", legal_name: "Jane Smith" } }, "/applicants/aB": { status: 200, data: { id: "aB", legal_name: "Omar Reyes" } } }, new Set(["/applicants/aB"]));
    const view = await render(<TransactionTenantLink canWrite={false} transaction={income("aA")} />, { wrapper: Screen });
    await settle();
    expect(screen.getByText("Linked to Jane Smith")).toBeTruthy();

    await view.rerender(<TransactionTenantLink canWrite={false} transaction={income("aB")} />);
    expect(screen.queryByText(/Jane Smith/)).toBeNull();
    expect(screen.getByText("Linked to a tenant")).toBeTruthy();

    await act(async () => releases["/applicants/aB"]());
    await settle();
    expect(screen.getByText("Linked to Omar Reyes")).toBeTruthy();
  });

  it("shows a generic tenant, not the previous one, when the next tenant is gone", async () => {
    serve({ "/applicants/aA": { status: 200, data: { id: "aA", legal_name: "Jane Smith" } } }, new Set());
    const view = await render(<TransactionTenantLink canWrite={false} transaction={income("aA")} />, { wrapper: Screen });
    await settle();
    expect(screen.getByText("Linked to Jane Smith")).toBeTruthy();

    await view.rerender(<TransactionTenantLink canWrite={false} transaction={income("aB")} />);
    await settle();
    expect(screen.queryByText(/Jane Smith/)).toBeNull();
    expect(screen.getByText("Linked to a tenant")).toBeTruthy();
  });
});
