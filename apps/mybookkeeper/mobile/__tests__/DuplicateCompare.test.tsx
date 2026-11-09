import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import DuplicateCompareScreen from "../src/features/duplicates/DuplicateCompareScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDuplicatePair, aDuplicateSide } from "../test-support/aDuplicatePair";
import { holdWrites } from "../test-support/holdWrites";
import { aProperty, startTransactionServer, type FakeTransactionServer } from "../test-support/transactionsServer";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path), back: () => mockBack() } }));
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
  jest.restoreAllMocks();
});

const PAIR_ID = "a1_b1";

async function renderScreen(id = PAIR_ID) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <DuplicateCompareScreen id={id} />
      </ToastProvider>
    </Provider>,
  );
}

function serve(): FakeTransactionServer {
  const server = startTransactionServer([], [aProperty({ id: "p1", name: "Oak Street" }), aProperty({ id: "p2", name: "Elm Street" })]);
  server.duplicates = [
    aDuplicatePair({
      transaction_a: aDuplicateSide({ id: "a1", source_file_name: "invoice.pdf", source_document_id: "d1", description: "Lumber" }),
      transaction_b: aDuplicateSide({ id: "b1", transaction_date: "2026-03-16", vendor: "HOME DEPOT #4410", source_file_name: "bank.csv", property_id: "p2" }),
    }),
  ];
  return server;
}

/** Answers the confirmation the way a person would. */
function answerAlert(button: string): jest.SpyInstance {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((candidate) => candidate.text === button)?.onPress?.();
  });
}

const writes = (server: FakeTransactionServer) => server.requests.filter((request) => request.method === "post");

describe("comparing a suspected duplicate", () => {
  it("stacks both records and marks what differs", async () => {
    serve();
    await renderScreen();
    expect(await screen.findByText("Same amount, 2 days apart")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Record A: Invoice/PDF" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Record B: Bank import" })).toBeTruthy();
    // Vendor, date, description and property differ; amount and category match.
    expect(screen.getByLabelText("Vendor: HOME DEPOT #4410, differs from the other")).toBeTruthy();
    expect(screen.getByLabelText("Date: Mar 14, 2026, differs from the other")).toBeTruthy();
    expect(screen.getByLabelText("Description: Lumber, differs from the other")).toBeTruthy();
    expect(screen.getByLabelText("Property: Elm Street, differs from the other")).toBeTruthy();
    expect(screen.getAllByLabelText("Amount: $84.20")).toHaveLength(2);
    expect(screen.getAllByLabelText("Category: Maintenance")).toHaveLength(2);
  });

  it("opens a record's source document", async () => {
    serve();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("link", { name: /invoice.pdf/ }));
    expect(mockPush).toHaveBeenCalledWith("/documents/d1");
  });

  it("starts each field on the website's default pick, and merges what's picked after confirming", async () => {
    const server = serve();
    const alert = answerAlert("Merge");
    await renderScreen();
    const vendor = await screen.findByLabelText("Vendor");
    // The longer vendor wins by default; the person switches to the other.
    expect(within(vendor).getByRole("radio", { name: /Record B/ }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(within(vendor).getByRole("radio", { name: /Record A/ }));
    expect(screen.getByText("Merged result preview")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Merge these two into one transaction" }));
    expect(alert).toHaveBeenCalledWith("Merge these two?", expect.any(String), expect.any(Array), expect.anything());
    expect(await screen.findByText("Transactions merged successfully")).toBeTruthy();
    const body = JSON.parse(String(writes(server).at(-1)?.data)) as Record<string, unknown>;
    expect(writes(server).at(-1)?.url).toBe("/transactions/duplicates/merge");
    expect(body).toMatchObject({
      transaction_a_id: "a1",
      transaction_b_id: "b1",
      surviving_id: "a1",
      field_overrides: { vendor: "a", transaction_date: "a", property_id: "a", description: "a" },
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it("merges nothing when the confirmation is cancelled", async () => {
    const server = serve();
    answerAlert("Cancel");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Merge these two into one transaction" }));
    expect(writes(server)).toHaveLength(0);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("dismisses the pair, naming both ids, and goes back", async () => {
    const server = serve();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark these two as not duplicates" }));
    expect(await screen.findByText("Marked as not duplicates")).toBeTruthy();
    expect(writes(server).at(-1)?.url).toBe("/transactions/duplicates/dismiss");
    expect(JSON.parse(String(writes(server).at(-1)?.data))).toEqual({ transaction_ids: ["a1", "b1"] });
    expect(mockBack).toHaveBeenCalled();
  });

  it("keeps only one after confirming, and says how many were removed", async () => {
    const server = serve();
    answerAlert("Keep only this one");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Keep only record B and delete the other" }));
    expect(await screen.findByText("Kept 1 transaction, removed 1")).toBeTruthy();
    expect(writes(server).at(-1)?.url).toBe("/transactions/duplicates/keep");
    expect(JSON.parse(String(writes(server).at(-1)?.data))).toEqual({ keep_id: "b1", delete_ids: ["a1"] });
    expect(mockBack).toHaveBeenCalled();
  });

  it("shows loading on the pressed button at once, and disables the others while it's on its way", async () => {
    serve();
    holdWrites();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark these two as not duplicates" }));
    expect(screen.getByText("Dismissing…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Merge these two into one transaction" }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole("button", { name: "Keep only record A and delete the other" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("stays on the comparison and says so when a write fails", async () => {
    const server = serve();
    server.failWritesWith = 500;
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark these two as not duplicates" }));
    expect(await screen.findByText("I couldn't mark those as not duplicates. Want to try again?")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mark these two as not duplicates" }).props.accessibilityState).not.toMatchObject({ disabled: true });
  });

  it.each([
    [403, "You have read-only access, so I can't change these."],
    [404, "I can't find one of these anymore. It may already have been merged or deleted."],
    [422, "These can't be merged as picked. Try again, or check the values."],
  ])("explains a %s from a merge", async (status, message) => {
    const server = serve();
    server.failWritesWith = status;
    answerAlert("Merge");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Merge these two into one transaction" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("gives a viewer the comparison with no way to change anything", async () => {
    const server = serve();
    server.role = "viewer";
    await renderScreen();
    expect(await screen.findByText(/view-only access/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark these two as not duplicates" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Merge these two into one transaction" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Keep only record/ })).toBeNull();
    expect(screen.queryByLabelText("Vendor")).toBeNull();
  });

  it("asks which date is right when only the date differs", async () => {
    const server = startTransactionServer([]);
    server.duplicates = [
      aDuplicatePair({ transaction_a: aDuplicateSide({ id: "a1" }), transaction_b: aDuplicateSide({ id: "b1", transaction_date: "2026-03-20" }), date_diff_days: 6 }),
    ];
    await renderScreen();
    expect(await screen.findByText("These look like the same expense from different dates. Which date is correct?")).toBeTruthy();
  });

  it("says it's ready to merge when nothing conflicts", async () => {
    const server = startTransactionServer([]);
    server.duplicates = [aDuplicatePair({ transaction_a: aDuplicateSide({ id: "a1" }), transaction_b: aDuplicateSide({ id: "b1" }), date_diff_days: 0 })];
    await renderScreen();
    expect(await screen.findByText("No conflicts found. All fields match, so it's ready to merge.")).toBeTruthy();
    expect(screen.queryByText("Merged result preview")).toBeNull();
  });

  it("warns when the amounts differ", async () => {
    const server = startTransactionServer([]);
    server.duplicates = [aDuplicatePair({ transaction_a: aDuplicateSide({ id: "a1" }), transaction_b: aDuplicateSide({ id: "b1", amount: "84.00" }) })];
    await renderScreen();
    expect(await screen.findByText("The amounts are different. Check which one is right.")).toBeTruthy();
  });

  it("says when the pair was already resolved, and goes back", async () => {
    serve();
    await renderScreen("zz_yy");
    expect(await screen.findByText("These are already sorted out")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to the list" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("shows a skeleton of the stacked records while it loads", async () => {
    serve();
    api.defaults.adapter = () => new Promise(() => undefined);
    await renderScreen();
    expect(screen.getByTestId("duplicate-compare-skeleton")).toBeTruthy();
    expect(screen.getByLabelText("Loading these transactions")).toBeTruthy();
  });

  it("offers a retry when it can't load, and shows the pair on retry", async () => {
    const server = serve();
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load your possible duplicates.")).toBeTruthy();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Same amount, 2 days apart")).toBeTruthy();
  });
});
