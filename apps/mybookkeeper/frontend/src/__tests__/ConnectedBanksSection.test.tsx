import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import type { PlaidItem } from "@mybookkeeper/api-client/types/plaid/plaid-item";
import ConnectedBanksSection from "@/app/features/financial-accounts/plaid/ConnectedBanksSection";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";

const listQuery = vi.fn();
const syncItem = vi.fn();
const disconnectItem = vi.fn();
vi.mock("@mybookkeeper/api-client/store/plaidApi", () => ({
  useListPlaidItemsQuery: () => listQuery(),
  useSyncPlaidItemMutation: () => [syncItem, { isLoading: false }],
  useDisconnectPlaidItemMutation: () => [disconnectItem, { isLoading: false }],
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

function anItem(overrides: Partial<PlaidItem> = {}): PlaidItem {
  return {
    id: "item-1", institution_name: "Chase", status: "active", error_code: null,
    last_synced_at: null, investments_status: null, holdings_synced_at: null, account_count: 2,
    created_at: "2026-11-23T00:00:00Z", ...overrides,
  };
}

function loaded(items: PlaidItem[]) {
  listQuery.mockReturnValue({ data: items, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() });
}

beforeEach(() => {
  listQuery.mockReset();
  syncItem.mockReset();
  disconnectItem.mockReset();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

describe("ConnectedBanksSection", () => {
  it("shows nothing until a bank is connected, so the manual page looks as before", () => {
    loaded([]);
    const { container } = render(<ConnectedBanksSection onReconnect={vi.fn()} onAddInvestments={vi.fn()} reconnectingItemId={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a skeleton while loading", () => {
    listQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn() });
    render(<ConnectedBanksSection onReconnect={vi.fn()} onAddInvestments={vi.fn()} reconnectingItemId={undefined} />);
    expect(screen.getByTestId("connected-banks-skeleton")).toBeInTheDocument();
  });

  it("syncs on demand and says what changed", async () => {
    loaded([anItem()]);
    syncItem.mockReturnValue({
      unwrap: () => Promise.resolve({ added: 3, modified: 0, removed: 1, matched_existing: 0, transfers_matched: 0, status: "active" }),
    });
    render(<ConnectedBanksSection onReconnect={vi.fn()} onAddInvestments={vi.fn()} reconnectingItemId={undefined} />);

    expect(screen.getByText("2 accounts")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("connected-bank-sync"));
    expect(syncItem).toHaveBeenCalledWith("item-1");
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Synced: 3 new, 1 removed."));
  });

  it("a sync the bank refuses for a sign-in says so", async () => {
    loaded([anItem()]);
    syncItem.mockReturnValue({ unwrap: () => Promise.reject({ status: 409, data: { detail: "login_required" } }) });
    render(<ConnectedBanksSection onReconnect={vi.fn()} onAddInvestments={vi.fn()} reconnectingItemId={undefined} />);
    await userEvent.click(screen.getByTestId("connected-bank-sync"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MSG.needsSignIn));
  });

  it("a connection needing a sign-in offers Reconnect instead of Sync now", async () => {
    loaded([anItem({ status: "login_required", error_code: "ITEM_LOGIN_REQUIRED" })]);
    const onReconnect = vi.fn();
    render(<ConnectedBanksSection onReconnect={onReconnect} onAddInvestments={vi.fn()} reconnectingItemId={undefined} />);

    expect(screen.getByTestId("connected-bank-status")).toHaveTextContent(MSG.needsSignIn);
    expect(screen.queryByTestId("connected-bank-sync")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("connected-bank-reconnect"));
    expect(onReconnect).toHaveBeenCalledWith("item-1");
  });

  it("disconnects only after confirming, and says the data stays", async () => {
    loaded([anItem()]);
    disconnectItem.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    render(<ConnectedBanksSection onReconnect={vi.fn()} onAddInvestments={vi.fn()} reconnectingItemId={undefined} />);

    await userEvent.click(screen.getByTestId("connected-bank-disconnect"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(MSG.disconnectDescription)).toBeInTheDocument();
    expect(disconnectItem).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: MSG.disconnect }));
    expect(disconnectItem).toHaveBeenCalledWith("item-1");
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MSG.disconnected));
  });

  it("a bank holding investments it hasn't shared offers Add investments", async () => {
    loaded([anItem({ investments_status: "consent_required" })]);
    const onAddInvestments = vi.fn();
    render(<ConnectedBanksSection onReconnect={vi.fn()} onAddInvestments={onAddInvestments} reconnectingItemId={undefined} />);

    expect(screen.getByTestId("connected-bank-investments")).toHaveTextContent(MSG.investmentsConsentNeeded);
    expect(screen.getByTestId("connected-bank-sync")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("connected-bank-add-investments"));
    expect(onAddInvestments).toHaveBeenCalledWith("item-1");
  });

  it("a bank with no investments looks exactly as before", () => {
    loaded([anItem({ investments_status: "unavailable" })]);
    render(<ConnectedBanksSection onReconnect={vi.fn()} onAddInvestments={vi.fn()} reconnectingItemId={undefined} />);
    expect(screen.queryByTestId("connected-bank-investments")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connected-bank-add-investments")).not.toBeInTheDocument();
  });
});
