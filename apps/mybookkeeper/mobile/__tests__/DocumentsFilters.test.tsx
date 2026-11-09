import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { useState } from "react";
import { Provider } from "react-redux";
import type { DocumentFilter } from "../src/types/DocumentFilter";
import DocumentsScreen from "../src/features/documents/DocumentsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDocument, startFakeServer } from "../test-support/documentsServer";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;
const RECEIPT = aDocument({ id: "r", file_name: "receipt.pdf", document_type: "receipt", source: "upload", created_at: "2026-11-01T00:00:00Z" });
const INVOICE = aDocument({ id: "i", file_name: "invoice.pdf", document_type: "invoice", source: "email", created_at: "2026-11-02T00:00:00Z" });
const BAD = aDocument({ id: "f", file_name: "bad.pdf", document_type: "w2", status: "failed", created_at: "2026-11-03T00:00:00Z" });
const REF = aDocument({ id: "e", file_name: "escrow.pdf", is_escrow_paid: true, created_at: "2026-10-01T00:00:00Z" });

function Harness() {
  const [filter, setFilter] = useState<DocumentFilter>("all");
  return <DocumentsScreen filter={filter} onFilterChange={setFilter} />;
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <Harness />
      </ToastProvider>
    </Provider>,
  );
}

const order = () =>
  screen
    .getAllByRole("button")
    .map((row) => String(row.props.accessibilityLabel ?? ""))
    .filter((label) => /\.pdf,/.test(label))
    .map((label) => label.split(",")[0]);

async function openSheet() {
  await fireEvent.press(await screen.findByRole("button", { name: /^Filters/ }));
}

async function apply() {
  await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("documents filters and order", () => {
  it("opens newest first, as the website does, and counts what is shown", async () => {
    startFakeServer([RECEIPT, BAD, INVOICE]);
    await renderScreen();
    await screen.findByText("receipt.pdf");
    expect(order()).toEqual(["bad.pdf", "invoice.pdf", "receipt.pdf"]);
    expect(screen.getByText("3 documents")).toBeTruthy();
  });

  it("narrows by status in the sheet, several at once, and counts the filters on", async () => {
    startFakeServer([RECEIPT, BAD, INVOICE]);
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Failed" }));
    await apply();
    expect(order()).toEqual(["bad.pdf"]);
    expect(screen.getByText("1 of 3 documents")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
    await openSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Completed" }));
    await apply();
    expect(order()).toHaveLength(3);
  });

  it("narrows by type and by source", async () => {
    startFakeServer([RECEIPT, BAD, INVOICE]);
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Invoice" }));
    await apply();
    expect(order()).toEqual(["invoice.pdf"]);
    await openSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Invoice" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Upload" }));
    await apply();
    expect(order()).toEqual(["bad.pdf", "receipt.pdf"]);
    expect(screen.getByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
  });

  it("sorts by a column in either direction", async () => {
    startFakeServer([RECEIPT, BAD, INVOICE]);
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "File name" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Ascending" }));
    await apply();
    expect(order()).toEqual(["bad.pdf", "invoice.pdf", "receipt.pdf"]);
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "Descending" }));
    await apply();
    expect(order()).toEqual(["receipt.pdf", "invoice.pdf", "bad.pdf"]);
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "Uploaded" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Ascending" }));
    await apply();
    expect(order()).toEqual(["receipt.pdf", "invoice.pdf", "bad.pdf"]);
  });

  it("discards sheet choices on Close", async () => {
    startFakeServer([RECEIPT, BAD, INVOICE]);
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Failed" }));
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(order()).toHaveLength(3);
  });

  it("clears every filter from the screen, and says when nothing matches", async () => {
    startFakeServer([RECEIPT, BAD, INVOICE]);
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Duplicate" }));
    await apply();
    expect(screen.getByText("Nothing matches that.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
    expect(order()).toHaveLength(3);
  });

  it("clears all in the sheet but keeps the search", async () => {
    startFakeServer([RECEIPT, BAD, INVOICE]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Search documents"), "pdf");
    await openSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Failed" }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));
    await apply();
    expect(order()).toHaveLength(3);
    expect(screen.getByLabelText("Search documents").props.value).toBe("pdf");
  });
});

describe("what the website flags on a document", () => {
  it("shows where it came from and a Reference chip for a reference-only document", async () => {
    startFakeServer([RECEIPT, INVOICE, REF]);
    await renderScreen();
    await screen.findByText("receipt.pdf");
    expect(screen.getByLabelText(/^receipt\.pdf/)).toBeTruthy();
    expect(within(screen.getByLabelText(/^receipt\.pdf/)).getByText(/Receipt · Upload/)).toBeTruthy();
    expect(within(screen.getByLabelText(/^invoice\.pdf/)).getByText(/Invoice · Email/)).toBeTruthy();
    expect(within(screen.getByLabelText(/^escrow\.pdf/)).getByText("Reference")).toBeTruthy();
    expect(within(screen.getByLabelText(/^receipt\.pdf/)).queryByText("Reference")).toBeNull();
  });

  it("tells about failed documents and shows them on request", async () => {
    startFakeServer([RECEIPT, BAD]);
    await renderScreen();
    expect(await screen.findByText("I had trouble with bad.pdf. Want me to try again?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show failed" }));
    expect(order()).toEqual(["bad.pdf"]);
    expect(screen.getByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
  });

  it("counts several failed documents and can be dismissed", async () => {
    startFakeServer([BAD, aDocument({ id: "g", file_name: "worse.pdf", status: "failed" })]);
    await renderScreen();
    expect(await screen.findByText("I had trouble with 2 documents. Want to take a look?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/I had trouble with/)).toBeNull();
  });

  it("says nothing about failures when there are none", async () => {
    startFakeServer([RECEIPT]);
    await renderScreen();
    await screen.findByText("receipt.pdf");
    expect(screen.queryByText(/I had trouble with/)).toBeNull();
  });
});
