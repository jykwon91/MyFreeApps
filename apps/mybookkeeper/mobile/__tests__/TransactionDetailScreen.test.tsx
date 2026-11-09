import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import TransactionDetailScreen from "../src/features/transactions/TransactionDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aProperty, aTransaction, lastPatch, startTransactionServer } from "../test-support/transactionsServer";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetParams = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (path: string) => mockPush(path),
    back: () => mockBack(),
    setParams: (params: unknown) => mockSetParams(params),
  },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

const WHOLE_QUEUE = { to_review: true };

async function renderScreen(id = "t1", reviewQueue: TransactionListParams | null = null) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TransactionDetailScreen id={id} reviewQueue={reviewQueue} />
      </ToastProvider>
    </Provider>,
  );
}

const WAITING = aTransaction({ status: "needs_review", review_reason: "The total looks off" });

describe("TransactionDetailScreen", () => {
  it("shows what it is and why it was flagged", async () => {
    startTransactionServer([WAITING]);
    await renderScreen();
    expect(await screen.findByText("Home Depot")).toBeTruthy();
    expect(screen.getByText("\u2212$84.20")).toBeTruthy();
    expect(screen.getByText("The total looks off")).toBeTruthy();
    expect(screen.getByText("Maintenance")).toBeTruthy();
    expect(await screen.findByText("Oak Street")).toBeTruthy();
  });

  it("approves one that has a property", async () => {
    const server = startTransactionServer([WAITING]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved.")).toBeTruthy();
    expect(lastPatch(server)).toEqual({ status: "approved" });
    expect(await screen.findByText("\u2713 Approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("asks for a property first when there isn't one, and sends it with the approval", async () => {
    const server = startTransactionServer([aTransaction({ status: "pending", property_id: null })], [aProperty(), aProperty({ id: "p2", name: "Retired", is_active: false })]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Which property is this for?")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Retired" })).toBeNull();
    await fireEvent.press(await screen.findByRole("radio", { name: "Oak Street" }));
    expect(await screen.findByText("Approved.")).toBeTruthy();
    expect(lastPatch(server)).toEqual({ status: "approved", property_id: "p1" });
  });

  it("moves to the next one in review and says how many are left", async () => {
    startTransactionServer([
      aTransaction({ id: "t1", status: "pending" }),
      aTransaction({ id: "t2", status: "pending" }),
      aTransaction({ id: "t3", status: "pending" }),
    ]);
    await renderScreen("t1", WHOLE_QUEUE);
    expect(await screen.findByText("3 to review")).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ id: "t2" }));
    expect(await screen.findByText("Approved. 2 left to review.")).toBeTruthy();
  });

  it("goes back after the last one in review", async () => {
    startTransactionServer([aTransaction({ status: "pending" })]);
    await renderScreen("t1", WHOLE_QUEUE);
    await screen.findByText("1 to review");
    await fireEvent.press(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved. That's the last one.")).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
  });

  it("stays within a filtered list and doesn't quote the count of everything", async () => {
    const server = startTransactionServer([
      aTransaction({ id: "t1", status: "pending", vendor: "Acme" }),
      aTransaction({ id: "t2", status: "pending", vendor: "Other" }),
      aTransaction({ id: "t3", status: "pending", vendor: "Acme" }),
    ]);
    await renderScreen("t1", { to_review: true, vendor: "acme" });
    await fireEvent.press(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ id: "t3" }));
    expect(screen.queryByText(/\d+ to review/)).toBeNull();
    expect(server.requests.some((request) => request.url === "/transactions/review-count")).toBe(false);
  });

  it("offers the next one when this one was already approved from the edit screen", async () => {
    startTransactionServer([aTransaction({ id: "t1" }), aTransaction({ id: "t2", status: "pending" })]);
    await renderScreen("t1", WHOLE_QUEUE);
    await fireEvent.press(await screen.findByRole("button", { name: "Next to review" }));
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ id: "t2" }));
  });

  it("doesn't call a row with a property unassigned while properties can't load", async () => {
    const server = startTransactionServer([aTransaction()], []);
    server.properties = [];
    await renderScreen();
    expect(await screen.findByText("A property")).toBeTruthy();
    expect(screen.queryByText("No property")).toBeNull();
  });

  it("treats deleting one that's already gone as done", async () => {
    const server = startTransactionServer([aTransaction()]);
    const alert = jest.spyOn(Alert, "alert");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    server.transactions.length = 0;
    await act(async () => {
      await alert.mock.calls[0]?.[2]?.find((button) => button.style === "destructive")?.onPress?.();
    });
    expect(await screen.findByText("That one's already gone.")).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
  });

  it("stays put and says so when approving fails", async () => {
    const server = startTransactionServer([WAITING]);
    server.failWritesWith = 500;
    await renderScreen("t1", WHOLE_QUEUE);
    await fireEvent.press(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("I couldn't approve that one. Want to try again?")).toBeTruthy();
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it("sends duplicates to the duplicates review, with nothing to approve, edit or delete", async () => {
    startTransactionServer([aTransaction({ status: "duplicate" })]);
    await renderScreen();
    expect(await screen.findByText(/duplicate of another transaction/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Review duplicates" }));
    expect(mockPush).toHaveBeenCalledWith("/duplicates");
    for (const name of ["Approve", "Edit", "Delete"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("shows a viewer no changes", async () => {
    const server = startTransactionServer([WAITING]);
    server.role = "viewer";
    await renderScreen();
    await screen.findByText("Home Depot");
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(() => resolve()));
    });
    for (const name of ["Approve", "Edit", "Delete"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("only offers Edit on one already approved, and opens the form", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));
    expect(mockPush).toHaveBeenCalledWith("/transactions/t1/edit");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("deletes after asking, and promises the document stays", async () => {
    const server = startTransactionServer([aTransaction({ source_document_id: "d1", source_file_name: "lumber.pdf" })]);
    const alert = jest.spyOn(Alert, "alert");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    const [title, body, buttons] = alert.mock.calls[0]!;
    expect(title).toBe("Delete Home Depot?");
    expect(body).toContain("The document it came from stays in Documents.");
    expect(server.transactions).toHaveLength(1);
    await act(async () => {
      await buttons?.find((button) => button.style === "destructive")?.onPress?.();
    });
    expect(server.transactions).toHaveLength(0);
    expect(mockBack).toHaveBeenCalled();
  });

  it("links to the document it came from", async () => {
    startTransactionServer([aTransaction({ source_document_id: "d1", source_file_name: "lumber.pdf" })]);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText("From lumber.pdf, open the document"));
    expect(mockPush).toHaveBeenCalledWith("/documents/d1");
  });

  it("says when it's gone", async () => {
    startTransactionServer([]);
    await renderScreen();
    expect(await screen.findByText("I can't find that transaction.")).toBeTruthy();
  });

  it("offers to try again when it can't load", async () => {
    const server = startTransactionServer([WAITING]);
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load that transaction.")).toBeTruthy();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Home Depot")).toBeTruthy();
  });
});
