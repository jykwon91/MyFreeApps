import { transactionsApi } from "@mybookkeeper/api-client/store/transactionsApi";
import type { RentLedgerResponse } from "@mybookkeeper/api-client/types/rent/rent-ledger-response";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { router } from "expo-router";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { RENT_MESSAGES } from "../src/constants/rent";
import TenantRent from "../src/features/rent/TenantRent";
import { rentNotesByPayment, rentPaymentNote } from "../src/features/rent/rentDisplay";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aRentCharge, aRentLedger, aRentPayment, aRentPeriod, aRentSchedule } from "../test-support/aRentLedger";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;

function startServer(ledger: RentLedgerResponse | "offline", role = "owner") {
  const server = { ledger, workspaceReads: 0, ledgerAsks: [] as (Record<string, unknown> | undefined)[] };
  const adapter: AxiosAdapter = async (config) => {
    if (config.url === "/organizations") {
      server.workspaceReads += 1;
      return { data: [{ id: "w1", name: "Mine", org_role: role }], status: 200, statusText: "", headers: {}, config } as never;
    }
    server.ledgerAsks.push(config.params as Record<string, unknown> | undefined);
    if (server.ledger === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    return { data: server.ledger, status: 200, statusText: "", headers: {}, config } as never;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function renderRent() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TenantRent applicantId="a1" />
      </ToastProvider>
    </Provider>,
  );
}

const IN_PROGRESS = aRentLedger({
  schedules: [aRentSchedule()],
  current_period: aRentPeriod(),
  charges: [aRentCharge()],
  total_charged: "1500.00",
  total_paid: "750.00",
  balance: "750.00",
});

beforeEach(async () => {
  await session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("the rent section", () => {
  it("shows what's owed this period from what the server worked out", async () => {
    startServer(IN_PROGRESS);
    await renderRent();

    expect(await screen.findByText("$1,500.00 monthly from March 1, 2026")).toBeTruthy();
    expect(screen.getByText("March 2026 · Mar 1 – Mar 31")).toBeTruthy();
    expect(screen.getAllByText("$750.00 of $1,500.00")).toHaveLength(2);
    expect(screen.getByText("$750.00 still to come this period.")).toBeTruthy();
    expect(screen.getByText("Owes $750.00 in total")).toBeTruthy();
    expect(screen.getByText("$750.00 paid of $1,500.00 charged")).toBeTruthy();
  });

  it("never asks the server for a date of its own", async () => {
    const server = startServer(IN_PROGRESS);
    await renderRent();
    await screen.findByText("Owes $750.00 in total");

    expect(server.ledgerAsks.every((params) => !params || !("as_of" in params))).toBe(true);
  });

  it("calls a period that ended short overdue instead of still to come", async () => {
    startServer(aRentLedger({ ...IN_PROGRESS, current_period: aRentPeriod({ status: "overdue", remaining: "300.00", allocated: "1200.00" }) }));
    await renderRent();

    expect(await screen.findByText("$300.00 is overdue.")).toBeTruthy();
    expect(screen.queryByText(/still to come/)).toBeNull();
  });

  it("says a covered period is covered", async () => {
    startServer(aRentLedger({ ...IN_PROGRESS, current_period: aRentPeriod({ status: "paid", remaining: "0.00", allocated: "1500.00" }) }));
    await renderRent();

    expect(await screen.findByText(RENT_MESSAGES.fullyCovered)).toBeTruthy();
  });

  it("doesn't call a waived period covered", async () => {
    startServer(aRentLedger({ ...IN_PROGRESS, current_period: aRentPeriod({ status: "waived", remaining: "0.00", allocated: "0.00" }) }));
    await renderRent();

    expect(await screen.findByText(RENT_MESSAGES.periodWaived)).toBeTruthy();
    expect(screen.queryByText(RENT_MESSAGES.fullyCovered)).toBeNull();
  });

  it("explains a prorated period", async () => {
    startServer(aRentLedger({ ...IN_PROGRESS, current_period: aRentPeriod({ full_amount: "1500.00", amount: "822.58" }) }));
    await renderRent();

    expect(await screen.findByText("Prorated from $1,500.00 for a partial period")).toBeTruthy();
  });

  it("says no rent is due when the schedule isn't running", async () => {
    startServer(aRentLedger({ schedules: [aRentSchedule()] }));
    await renderRent();

    expect(await screen.findByText(RENT_MESSAGES.noneDue)).toBeTruthy();
    expect(screen.getByText(RENT_MESSAGES.settled)).toBeTruthy();
  });

  it("doesn't say nothing is due above a balance still owed", async () => {
    startServer(aRentLedger({ schedules: [aRentSchedule({ end_date: "2026-08-31" })], charges: [aRentCharge({ status: "overdue" })], balance: "750.00", total_charged: "1500.00", total_paid: "750.00" }));
    await renderRent();

    expect(await screen.findByText("Owes $750.00 in total")).toBeTruthy();
    expect(screen.queryByText(RENT_MESSAGES.noneDue)).toBeNull();
  });

  it("reloads when a payment changes", async () => {
    const server = startServer(IN_PROGRESS);
    await renderRent();
    await screen.findByText("Owes $750.00 in total");
    const asksBefore = server.ledgerAsks.length;

    server.ledger = { ...IN_PROGRESS, balance: "0.00" };
    await act(async () => {
      store.dispatch(transactionsApi.util.invalidateTags([{ type: "Transaction", id: "LIST" }]));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(server.ledgerAsks.length).toBeGreaterThan(asksBefore);
    expect(await screen.findByText(RENT_MESSAGES.settled)).toBeTruthy();
  });

  it("says when a tenant has paid ahead", async () => {
    startServer(aRentLedger({ ...IN_PROGRESS, balance: "-120.00", total_paid: "1620.00" }));
    await renderRent();

    expect(await screen.findByText("Paid ahead by $120.00")).toBeTruthy();
  });

  it("reads the balance as one thing", async () => {
    startServer(IN_PROGRESS);
    await renderRent();

    expect(await screen.findByLabelText("Balance: Owes $750.00 in total. $750.00 paid of $1,500.00 charged.")).toBeTruthy();
  });

  it("shows charges with no schedule behind them", async () => {
    startServer(aRentLedger({ charges: [aRentCharge({ schedule_id: null, charge_type: "late_fee", amount: "50.00", allocated: "0.00", remaining: "50.00", status: "open" })], balance: "50.00", total_charged: "50.00" }));
    await renderRent();

    expect(await screen.findByText("Late fee · Mar 1")).toBeTruthy();
    expect(screen.queryByText(RENT_MESSAGES.notSetUp)).toBeNull();
    expect(screen.queryByText(RENT_MESSAGES.noneDue)).toBeNull();
  });
});

describe("when no rent is set up", () => {
  it("sends someone who can edit to the website", async () => {
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const server = startServer(aRentLedger());
    await renderRent();
    await screen.findByText(RENT_MESSAGES.notSetUp);
    await act(async () => {
      while (server.workspaceReads === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await fireEvent.press(await screen.findByText(RENT_MESSAGES.setUpOnWebsite));

    expect(opened).toHaveBeenCalledWith(expect.stringContaining("/applicants/a1"));
    opened.mockRestore();
  });

  it("doesn't offer a view-only person the setup link", async () => {
    const server = startServer(aRentLedger(), "viewer");
    await renderRent();
    await screen.findByText(RENT_MESSAGES.notSetUp);
    await act(async () => {
      while (server.workspaceReads === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText(RENT_MESSAGES.setUpOnWebsite)).toBeNull();
  });
});

describe("the charge list", () => {
  it("puts the newest charge first", async () => {
    startServer(aRentLedger({
      schedules: [aRentSchedule()],
      charges: [aRentCharge({ id: "c1" }), aRentCharge({ id: "c2", period_start: "2026-04-01", period_end: "2026-04-30" })],
    }));
    await renderRent();
    await screen.findByText("Apr 1 – Apr 30");

    const titles = screen.getAllByText(/^(Mar 1 – Mar 31|Apr 1 – Apr 30)$/).map((node) => node.props.children as string);
    expect(titles).toEqual(["Apr 1 – Apr 30", "Mar 1 – Mar 31"]);
  });

  it("opens a charge to the payments applied to it, each leading to its transaction", async () => {
    startServer(aRentLedger({
      charges: [aRentCharge({ applications: [{ transaction_id: "t9", paid_on: "2026-03-04", amount: "125.00", payer_name: "Alex", payment_total: "375.00" }] })],
    }));
    await renderRent();
    const row = await screen.findByLabelText(/^Rent, March 1, 2026 to March 31, 2026/);
    expect(screen.queryByText("$125.00 of a $375.00 payment")).toBeNull();
    expect(row.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));

    await fireEvent.press(row);
    expect(screen.getByLabelText(/^Rent, March 1/).props.accessibilityState).toEqual(expect.objectContaining({ expanded: true }));
    expect(screen.getByText("Mar 4 · Alex")).toBeTruthy();

    await fireEvent.press(screen.getByText("$125.00 of a $375.00 payment"));
    expect(router.push).toHaveBeenCalledWith("/transactions/t9");
  });

  it("says when nothing has been applied", async () => {
    startServer(aRentLedger({ charges: [aRentCharge({ status: "open", allocated: "0.00", remaining: "1500.00" })] }));
    await renderRent();

    await fireEvent.press(await screen.findByLabelText(/^Rent, March 1/));

    expect(screen.getByText(RENT_MESSAGES.nothingApplied)).toBeTruthy();
  });

  it("shows why a charge was waived", async () => {
    startServer(aRentLedger({ charges: [aRentCharge({ status: "waived", waived_at: "2026-03-02T12:00:00Z", waived_reason: "Broken boiler" })] }));
    await renderRent();

    expect(await screen.findByText("Waived: Broken boiler")).toBeTruthy();
    expect(screen.getByText("Waived")).toBeTruthy();
    expect(screen.queryByText(/\$0\.00 of/)).toBeNull();

    const row = screen.getByLabelText(/Waived: Broken boiler$/);
    await fireEvent.press(row);
    expect(screen.getByText(RENT_MESSAGES.waivedNothingApplied)).toBeTruthy();
    expect(screen.queryByText(RENT_MESSAGES.nothingApplied)).toBeNull();
  });

  it("tells apart one-off charges and says why one is smaller", async () => {
    startServer(aRentLedger({ charges: [
      aRentCharge({ id: "c1", charge_type: "late_fee", due_date: "2026-03-05", amount: "50.00", allocated: "0.00" }),
      aRentCharge({ id: "c2", charge_type: "late_fee", due_date: "2026-04-05", amount: "50.00", allocated: "0.00", description: "" }),
      aRentCharge({ id: "c3", full_amount: "1500.00", amount: "822.58", allocated: "0.00" }),
    ] }));
    await renderRent();

    expect(await screen.findByText("Late fee · Mar 5")).toBeTruthy();
    expect(screen.getByText("Late fee · Apr 5")).toBeTruthy();
    expect(screen.getByLabelText(/^Late fee, due April 5, 2026/)).toBeTruthy();
    expect(screen.getByLabelText(/Prorated from \$1,500\.00 for a partial period$/)).toBeTruthy();
  });

  it("shortens a long list until asked", async () => {
    const charges = Array.from({ length: 8 }, (_, index) => aRentCharge({ id: `c${index}`, period_start: `2026-0${index + 1}-01`, period_end: `2026-0${index + 1}-28` }));
    startServer(aRentLedger({ charges }));
    await renderRent();

    await screen.findByText("Show all 8 charges");
    expect(screen.queryByText(/^Jan 1 –/)).toBeNull();

    await fireEvent.press(screen.getByText("Show all 8 charges"));
    expect(screen.getByText(/^Jan 1 –/)).toBeTruthy();
    expect(screen.getByText(RENT_MESSAGES.showFewer)).toBeTruthy();
  });
});

describe("when loading fails", () => {
  it("says so and tries again", async () => {
    const server = startServer("offline");
    await renderRent();

    expect(await screen.findByText(RENT_MESSAGES.couldntLoad)).toBeTruthy();

    server.ledger = IN_PROGRESS;
    await fireEvent.press(screen.getByText(RENT_MESSAGES.tryAgain));

    expect(await screen.findByText("Owes $750.00 in total")).toBeTruthy();
  });

  it("keeps what it had and says it's old", async () => {
    const server = startServer(IN_PROGRESS);
    await renderRent();
    await screen.findByText("Owes $750.00 in total");

    server.ledger = "offline";
    await act(async () => {
      await store.dispatch(baseApi.util.invalidateTags([{ type: "RentLedger" as never, id: "a1" }]));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Owes $750.00 in total")).toBeTruthy();
  });
});

describe("how a payment applied to rent", () => {
  it("names the periods", () => {
    expect(rentPaymentNote(aRentPayment({ applied_to: ["Mar 1 – Mar 7, 2026", "Mar 8 – Mar 14, 2026"] }))).toBe("Applied to Mar 1 – Mar 7, 2026 and Mar 8 – Mar 14, 2026");
  });

  it("names a period once when a payment touched two charges in it", () => {
    expect(rentPaymentNote(aRentPayment({ applied_to: ["March 2026", "March 2026"] }))).toBe("Applied to March 2026");
  });

  it("adds what's left over as credit", () => {
    expect(rentPaymentNote(aRentPayment({ unapplied: "50.00" }))).toBe("Applied to March 2026 · $50.00 held as credit");
  });

  it("says all credit when none of it applied", () => {
    expect(rentPaymentNote(aRentPayment({ applied_to: [], unapplied: "750.00" }))).toBe("Held as credit");
  });

  it("says nothing with nothing to say", () => {
    expect(rentPaymentNote(aRentPayment({ applied_to: [] }))).toBeNull();
  });

  it("doesn't call payments credit when there's no rent to apply them to", () => {
    const ledger = aRentLedger({ payments: [aRentPayment({ applied_to: [], unapplied: "750.00" })] });
    expect(rentNotesByPayment(ledger).size).toBe(0);
  });

  it("does once there is", () => {
    const ledger = aRentLedger({ schedules: [aRentSchedule()], payments: [aRentPayment({ applied_to: [], unapplied: "750.00" })] });
    expect(rentNotesByPayment(ledger).get("t1")).toBe(RENT_MESSAGES.heldAsCredit);
  });
});
