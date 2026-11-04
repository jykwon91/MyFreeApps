import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import DocumentsScreen from "../src/features/documents/DocumentsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDocument, startFakeServer } from "../test-support/documentsServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path) },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;
const OLD = aDocument({ id: "old", file_name: "old.pdf", created_at: "2026-10-01T00:00:00Z" });
const NEW = aDocument({ id: "new", file_name: "new.pdf", created_at: "2026-11-01T00:00:00Z" });
const FAILED = aDocument({ id: "bad", file_name: "bad.pdf", status: "failed", created_at: "2026-09-01T00:00:00Z" });

async function renderScreen() {
  await render(
    <Provider store={store}>
      <DocumentsScreen />
    </Provider>,
  );
}

const rowNames = () =>
  screen.getAllByRole("button").map((row) => row.props.accessibilityLabel).filter(Boolean);

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  mockPush.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("DocumentsScreen", () => {
  it("lists documents in the order the server sends and opens the one tapped", async () => {
    startFakeServer([NEW, OLD]);
    await renderScreen();
    await screen.findByText("new.pdf");
    expect(rowNames()[0]).toContain("new.pdf");
    expect(rowNames()[1]).toContain("old.pdf");
    await fireEvent.press(screen.getByText("new.pdf"));
    expect(mockPush).toHaveBeenCalledWith("/documents/new");
  });

  it("narrows to the ones that need a look", async () => {
    startFakeServer([NEW, FAILED]);
    await renderScreen();
    await screen.findByText("new.pdf");
    await fireEvent.press(screen.getByRole("tab", { name: "Needs a look" }));
    expect(screen.queryByText("new.pdf")).toBeNull();
    expect(screen.getByText("bad.pdf")).toBeTruthy();
  });

  it("searches by file name", async () => {
    startFakeServer([NEW, OLD]);
    await renderScreen();
    await screen.findByText("new.pdf");
    await fireEvent.changeText(screen.getByLabelText("Search documents"), "OLD");
    expect(screen.queryByText("new.pdf")).toBeNull();
    expect(screen.getByText("old.pdf")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search documents"), "nothing");
    expect(screen.getByText("Nothing matches that.")).toBeTruthy();
  });

  it("offers someone who can add documents the camera when there are none", async () => {
    startFakeServer([]);
    await renderScreen();
    await screen.findByText("No documents yet");
    await fireEvent.press(await screen.findByRole("button", { name: "Take a photo" }));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("offers a viewer no way to add one", async () => {
    startFakeServer([], "viewer");
    await renderScreen();
    await screen.findByText("They'll show up here once someone adds one.");
    expect(screen.queryByRole("button", { name: "Take a photo" })).toBeNull();
  });

  it("recovers when the first load fails", async () => {
    const server = startFakeServer([NEW]);
    server.offline = true;
    await renderScreen();
    await screen.findByText("I couldn't load your documents.");
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("new.pdf")).toBeTruthy();
  });

  it("keeps what it last loaded when a refresh fails", async () => {
    const server = startFakeServer([NEW]);
    await renderScreen();
    await screen.findByText("new.pdf");
    server.offline = true;
    await act(async () => {
      await screen.getByTestId("documents-list").props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(screen.getByText(/This is what I last loaded/)).toBeTruthy());
    expect(screen.getByText("new.pdf")).toBeTruthy();
  });

  it("never shows a raw type name it has no label for", async () => {
    startFakeServer([aDocument({ document_type: "some_new_type" as never })]);
    await renderScreen();
    await screen.findByText("lumber.pdf");
    expect(screen.queryByText(/some_new_type/)).toBeNull();
  });

  it("says when a document is still being read", async () => {
    startFakeServer([aDocument({ status: "processing" })]);
    await renderScreen();
    expect(await screen.findByText("Hmm, let me take a look at this…")).toBeTruthy();
  });
});
