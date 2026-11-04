import { transactionsApi } from "@mybookkeeper/api-client/store/transactionsApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { router } from "expo-router";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import TenantPayments from "../src/features/applicants/TenantPayments";
import { tenantPaymentTotals } from "../src/features/applicants/tenantPaymentTotals";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aTransaction } from "../test-support/transactionsServer";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;

function aPayment(overrides: Partial<Transaction> = {}): Transaction {
  return aTransaction({ id: "t1", transaction_type: "income", category: "rental_revenue", amount: "1200.00", status: "approved", payer_name: "Dana Reed", vendor: null, transaction_date: "2026-03-01", ...overrides });
}

function startServer(payments: Transaction[] | "offline") {
  const server = { payments, requests: [] as AxiosRequestConfig[] };
  const adapter: AxiosAdapter = async (config) => {
    server.requests.push(config);
    if (server.payments === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    return { data: server.payments, status: 200, statusText: "", headers: {}, config } as never;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function renderSection() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TenantPayments applicantId="a1" name="Dana Reed" />
      </ToastProvider>
    </Provider>,
  );
}

describe("a tenant's payments", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it("asks for this tenant's money in", async () => {
    const server = startServer([aPayment()]);
    await renderSection();
    await screen.findByText("Dana Reed");

    expect(server.requests[0].url).toBe("/transactions");
    expect(server.requests[0].params).toMatchObject({ applicant_id: "a1", transaction_type: "income" });
  });

  it("shows who paid, how much and when, and opens the transaction", async () => {
    startServer([aPayment()]);
    await renderSection();

    expect(await screen.findByText("+$1,200.00")).toBeTruthy();
    expect(screen.getByText(/^Mar 1/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Dana Reed, Rental Revenue/ }));
    expect(router.push).toHaveBeenCalledWith("/transactions/t1");
  });

  it("names the payment when the payer's unknown", async () => {
    startServer([aPayment({ payer_name: null, vendor: "Zelle" }), aPayment({ id: "t2", payer_name: null, vendor: null })]);
    await renderSection();

    expect(await screen.findByText("Zelle")).toBeTruthy();
    expect(screen.getByText("Payment")).toBeTruthy();
  });

  it("calls out deposits inside the total", async () => {
    startServer([aPayment(), aPayment({ id: "t2", category: "security_deposit", amount: "500.00" })]);
    await renderSection();

    expect(await screen.findByText("Total received: $1,700.00")).toBeTruthy();
    expect(screen.getByText("Includes $500.00 in deposits.")).toBeTruthy();
  });

  it("doesn't mention deposits when there are none", async () => {
    startServer([aPayment()]);
    await renderSection();
    await screen.findByText("Total received: $1,200.00");

    expect(screen.queryByText(/in deposits/)).toBeNull();
  });

  it("marks a payment still in review and leaves it out of the total", async () => {
    startServer([aPayment(), aPayment({ id: "t2", status: "needs_review", amount: "99.00" })]);
    await renderSection();

    expect(await screen.findByText("Total received: $1,200.00")).toBeTruthy();
    expect(screen.getByText("Needs review")).toBeTruthy();
  });

  it("shows the newest six, then all of them on request, then fewer again", async () => {
    startServer(Array.from({ length: 8 }, (_, index) => aPayment({ id: `t${index}`, payer_name: `Payer ${index}` })));
    await renderSection();
    await screen.findByText("Payer 5");

    expect(screen.queryByText("Payer 6")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show all 8 payments" }));
    expect(screen.getByText("Payer 7")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Payer 6")).toBeNull();
  });

  it("offers no control when everything already shows", async () => {
    startServer(Array.from({ length: 6 }, (_, index) => aPayment({ id: `t${index}` })));
    await renderSection();
    await screen.findByText("Total received: $7,200.00");

    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("says so when there aren't any", async () => {
    startServer([]);
    await renderSection();

    expect(await screen.findByText("No payments from Dana Reed yet.")).toBeTruthy();
  });

  it("keeps what it had when a reload fails, and says so", async () => {
    const server = startServer([aPayment()]);
    await renderSection();
    await screen.findByText("Total received: $1,200.00");

    server.payments = "offline";
    await act(async () => {
      store.dispatch(transactionsApi.util.invalidateTags([{ type: "Transaction", id: "LIST" }]));
    });

    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Total received: $1,200.00")).toBeTruthy();
  });

  it("doesn't read a failed load as no payments, and can try again", async () => {
    const server = startServer("offline");
    await renderSection();

    expect(await screen.findByText("I couldn't load their payments.")).toBeTruthy();
    expect(screen.queryByText(/No payments/)).toBeNull();

    server.payments = [aPayment()];
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Total received: $1,200.00")).toBeTruthy();
  });
});

describe("the total", () => {
  it("takes a negative payment back off", () => {
    expect(tenantPaymentTotals([aPayment(), aPayment({ amount: "-200.00" })]).received).toBe(1000);
  });


  it("adds in whole cents, so it can't pick up a rounding residue", () => {
    const payments = [aPayment({ amount: "0.10" }), aPayment({ amount: "0.20" })];

    expect(tenantPaymentTotals(payments).received).toBe(0.3);
  });
});
