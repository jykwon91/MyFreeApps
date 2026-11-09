import { REFERENCE_ONLY_COPY } from "@mybookkeeper/api-client/constants/documentReferenceOnly";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { DOCUMENT_ACTION_MESSAGES, DOCUMENT_LIST_MESSAGES } from "../src/constants/documents";
import DocumentDetailScreen from "../src/features/documents/DocumentDetailScreen";
import { clearDocumentFiles } from "../src/features/documents/openDocumentFile";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDocument, startFakeServer } from "../test-support/documentsServer";
import { holdWrites } from "../test-support/holdWrites";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockHasPermission = jest.fn(() => true);
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockShare = jest.fn();
const mockDirectoryDelete = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));
jest.mock("expo-file-system", () => {
  class Directory {
    exists = true;
    create() {}
    delete() {
      mockDirectoryDelete();
    }
  }
  class File {
    uri: string;
    exists = true;
    static downloadFileAsync = (...args: unknown[]) => mockDownload(...args);
    constructor(_directory: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    delete() {
      mockDelete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: "cache" } };
});
jest.mock("expo-sharing", () => ({ shareAsync: (...args: unknown[]) => mockShare(...args) }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => mockHasPermission(),
}));

const originalAdapter = api.defaults.adapter;

async function renderDetail() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <DocumentDetailScreen id="d1" />
      </ToastProvider>
    </Provider>,
  );
  await screen.findByRole("header");
  // The actions wait on knowing the workspace's role.
  await act(async () => {
    await store.dispatch(baseApi.util.getRunningQueriesThunk());
  });
}

beforeEach(() => {
  session.tokenStore.set("the-token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  mockDownload.mockResolvedValue({});
  mockShare.mockResolvedValue(undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("DocumentDetailScreen", () => {
  it("shows a photo with the sign-in in the headers, not the address", async () => {
    startFakeServer([aDocument({ file_mime_type: "image/jpeg" })]);
    await renderDetail();
    const source = screen.getByLabelText(/^Photo of/).props.source;
    expect(source.uri).toMatch(/\/documents\/d1\/download$/);
    expect(source.uri).not.toContain("the-token");
    expect(source.headers).toEqual({ Authorization: "Bearer the-token", "X-Organization-Id": "w1" });
  });

  it("renews the sign-in and tries a photo again before giving up", async () => {
    const server = startFakeServer([aDocument({ file_mime_type: "image/jpeg" })]);
    await renderDetail();
    const before = server.requests.length;
    session.tokenStore.set("newer-token");
    await act(async () => {
      screen.getByLabelText(/^Photo of/).props.onError();
    });
    await waitFor(() => expect(server.requests.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByLabelText(/^Photo of/).props.source.headers.Authorization).toBe("Bearer newer-token"));
    await act(async () => {
      screen.getByLabelText(/^Photo of/).props.onError();
    });
    expect(await screen.findByText("Open on the website")).toBeTruthy();
  });

  it("removes every leftover copy when asked", async () => {
    clearDocumentFiles();
    expect(mockDirectoryDelete).toHaveBeenCalled();
  });

  it("opens a PDF, then removes the downloaded copy", async () => {
    startFakeServer([aDocument({ file_name: "../../evil.pdf" })]);
    await renderDetail();
    await fireEvent.press(screen.getByRole("button", { name: "Open PDF" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("file:///cache/d1.pdf"));
    const [url, , options] = mockDownload.mock.calls[0];
    expect(url).not.toContain("the-token");
    expect(options.headers).toEqual({ Authorization: "Bearer the-token", "X-Organization-Id": "w1" });
    expect(mockShare.mock.calls[0][0]).toBe("file:///cache/d1.pdf");
  });

  it("says so when a PDF won't open, and still removes the copy", async () => {
    mockShare.mockRejectedValue(new Error("no viewer"));
    startFakeServer([aDocument()]);
    await renderDetail();
    await fireEvent.press(screen.getByRole("button", { name: "Open PDF" }));
    expect(await screen.findByText("I couldn't open that file. Want to try again?")).toBeTruthy();
    expect(mockDelete).toHaveBeenCalled();
  });

  it("explains an email with no saved file", async () => {
    startFakeServer([aDocument({ source: "email", file_mime_type: null })]);
    await renderDetail();
    expect(screen.getByText(/The original email isn't saved/)).toBeTruthy();
  });

  it("deletes only after confirming, then goes back", async () => {
    const server = startFakeServer([aDocument()]);
    const alert = jest.spyOn(Alert, "alert");
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    expect(server.requests.some((request) => request.method === "delete")).toBe(false);
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe("Delete lumber.pdf?");
    await act(async () => {
      buttons?.find((button) => button.style === "destructive")?.onPress?.();
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(server.requests.some((request) => request.method === "delete")).toBe(true);
    alert.mockRestore();
  });

  it("shows the server's reason when deleting is refused because it is being read", async () => {
    const server = startFakeServer([aDocument()]);
    const alert = jest.spyOn(Alert, "alert");
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    server.failWritesWith = 409;
    await act(async () => {
      alert.mock.calls[0][2]?.find((button) => button.style === "destructive")?.onPress?.();
    });
    expect(await screen.findByText("nope")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("says a document is already gone when deleting finds nothing, and goes back", async () => {
    const server = startFakeServer([aDocument()]);
    const alert = jest.spyOn(Alert, "alert");
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    server.failWritesWith = 404;
    await act(async () => {
      alert.mock.calls[0][2]?.find((button) => button.style === "destructive")?.onPress?.();
    });
    expect(await screen.findByText(DOCUMENT_ACTION_MESSAGES.alreadyGone)).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
    alert.mockRestore();
  });

  it("shows the server's reason when reading again is refused", async () => {
    const server = startFakeServer([aDocument({ status: "failed" })]);
    await renderDetail();
    server.failWritesWith = 409;
    await fireEvent.press(await screen.findByRole("button", { name: "Try reading it again" }));
    expect(await screen.findByText("nope")).toBeTruthy();
  });

  it("tries a failed document again and shows why it failed", async () => {
    const server = startFakeServer([aDocument({ status: "failed", error_message: "Blurry" })]);
    await renderDetail();
    expect(screen.getByText("I had trouble reading this one.")).toBeTruthy();
    expect(screen.getByText("Blurry")).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: "Try reading it again" }));
    await waitFor(() => expect(server.requests.some((request) => request.method === "post")).toBe(true));
  });

  it("asks for permission instead of sending a document to read again", async () => {
    mockHasPermission.mockReturnValueOnce(false);
    const server = startFakeServer([aDocument({ status: "failed" })]);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Try reading it again" }));
    expect(mockPush).toHaveBeenCalledWith("/ai-permission");
    expect(server.requests.some((request) => request.method === "post")).toBe(false);
  });

  it("offers a viewer no changes", async () => {
    startFakeServer([aDocument({ status: "failed" })], "viewer");
    await renderDetail();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try reading it again" })).toBeNull();
  });

  it("says when a document is gone", async () => {
    startFakeServer([]);
    await render(
      <Provider store={store}>
        <DocumentDetailScreen id="d1" />
      </Provider>,
    );
    expect(await screen.findByText("I can't find that document.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("shows a deleted document as deleted, with no file and no actions", async () => {
    startFakeServer([aDocument({ status: "deleted" })]);
    await renderDetail();
    expect(screen.getByText(DOCUMENT_LIST_MESSAGES.deletedStatusLine)).toBeTruthy();
    expect(screen.getByText(DOCUMENT_LIST_MESSAGES.deletedFileNote)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as reference-only" })).toBeNull();
  });

  it("offers no delete or reference-only change while a document is being read", async () => {
    startFakeServer([aDocument({ status: "processing" })]);
    await renderDetail();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as reference-only" })).toBeNull();
  });

  it("marks a document reference-only only after warning that its transactions go", async () => {
    const server = startFakeServer([aDocument()]);
    server.transactionsRemoved = 2;
    const alert = jest.spyOn(Alert, "alert");
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark as reference-only" }));
    expect(server.requests.some((request) => request.method === "patch")).toBe(false);
    const [title, body, buttons] = alert.mock.calls[0];
    expect(title).toBe(REFERENCE_ONLY_COPY.confirmTitle);
    expect(body).toBe(REFERENCE_ONLY_COPY.confirmBody);
    await act(async () => {
      buttons?.find((button) => button.text === "Mark as reference-only")?.onPress?.();
    });
    expect(await screen.findByText("Marked as reference-only \u2014 removed 2 transactions")).toBeTruthy();
    expect(JSON.parse(String(server.requests.find((request) => request.method === "patch")?.data))).toEqual({ is_escrow_paid: true });
    expect(await screen.findByText("Reference")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unmark as reference-only" })).toBeTruthy();
    alert.mockRestore();
  });

  it("unmarks a reference-only document without asking", async () => {
    const server = startFakeServer([aDocument({ is_escrow_paid: true })]);
    const alert = jest.spyOn(Alert, "alert");
    await renderDetail();
    expect(screen.getByText("Reference")).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: "Unmark as reference-only" }));
    expect(await screen.findByText(REFERENCE_ONLY_COPY.unmarked)).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    expect(JSON.parse(String(server.requests.find((request) => request.method === "patch")?.data))).toEqual({ is_escrow_paid: false });
    expect(screen.queryByText("Reference")).toBeNull();
    alert.mockRestore();
  });

  it("says when marking reference-only fails, and when it can't reach the server", async () => {
    const server = startFakeServer([aDocument({ is_escrow_paid: true })]);
    await renderDetail();
    server.failWritesWith = 500;
    await fireEvent.press(await screen.findByRole("button", { name: "Unmark as reference-only" }));
    expect(await screen.findByText("I couldn't update that document. Want to try again?")).toBeTruthy();
    server.failWritesWith = null;
    server.offline = true;
    await fireEvent.press(await screen.findByRole("button", { name: "Unmark as reference-only" }));
    expect(await screen.findByText("I can't reach the server, so I couldn't update that. Want to try again?")).toBeTruthy();
  });

  it("shows loading on the reference-only button and sends once", async () => {
    startFakeServer([aDocument({ is_escrow_paid: true })]);
    await renderDetail();
    const writes: string[] = [];
    holdWrites();
    const held = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => {
      if (config.method === "patch") writes.push(String(config.url));
      return held(config);
    };
    await fireEvent.press(await screen.findByRole("button", { name: "Unmark as reference-only" }));
    expect(await screen.findByText("Unmarking…")).toBeTruthy();
    await fireEvent.press(screen.getByText("Unmarking…"));
    expect(writes).toEqual(["/documents/d1/escrow-paid"]);
  });

  it("offers a viewer no reference-only change", async () => {
    startFakeServer([aDocument()], "viewer");
    await renderDetail();
    expect(screen.queryByRole("button", { name: "Mark as reference-only" })).toBeNull();
  });
});
