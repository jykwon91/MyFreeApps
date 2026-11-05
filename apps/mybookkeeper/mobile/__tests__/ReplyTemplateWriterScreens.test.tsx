import { inquiriesApi } from "@mybookkeeper/api-client/store/inquiriesApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { archiveTemplateTitle, REPLY_TEMPLATE_MESSAGES as MESSAGES } from "../src/constants/replyTemplates";
import ReplyTemplateDetailScreen from "../src/features/replyTemplates/ReplyTemplateDetailScreen";
import ReplyTemplatesScreen from "../src/features/replyTemplates/ReplyTemplatesScreen";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aReplyTemplate } from "../test-support/aReplyTemplate";
import { anInquiry, lastInquiryWrite, startInquiryServer, type FakeInquiryServer } from "../test-support/inquiriesServer";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

function serverWith(templates = [aReplyTemplate()], role = "owner"): FakeInquiryServer {
  const server = startInquiryServer([anInquiry()]);
  server.templates = templates;
  server.role = role;
  return server;
}

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

const button = (name: string) => screen.getByRole("button", { name });

describe("the list of templates for someone who can write", () => {
  it("has a New template button that opens the new screen", async () => {
    serverWith();
    await show(<ReplyTemplatesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.newTemplate }));
    expect(mockPush).toHaveBeenCalledWith("/reply-templates/new");
  });

  it("offers to make one when there are none", async () => {
    serverWith([]);
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(MESSAGES.noneHeading);
    expect(screen.getByText(MESSAGES.noneBody)).toBeTruthy();
    await fireEvent.press(button(MESSAGES.makeOne));
    expect(mockPush).toHaveBeenCalledWith("/reply-templates/new");
  });

  it("doesn't read a failed load as 'none', and still lets me make one", async () => {
    const server = serverWith();
    server.offline = true;
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(MESSAGES.couldntLoadList);
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(button(MESSAGES.newTemplate)).toBeTruthy();
  });

  it("keeps the New template button beside the banner when a reload fails", async () => {
    const server = serverWith();
    await show(<ReplyTemplatesScreen />);
    await screen.findByText("Polite decline");
    server.offline = true;
    await screen.getByTestId("reply-templates-list").props.refreshControl.props.onRefresh();
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(button(MESSAGES.newTemplate)).toBeTruthy();
  });
});

describe("the list of templates for a viewer", () => {
  it("has no New template button", async () => {
    serverWith([aReplyTemplate()], "viewer");
    await show(<ReplyTemplatesScreen />);
    await screen.findByText("Polite decline");
    expect(screen.queryByRole("button", { name: MESSAGES.newTemplate })).toBeNull();
  });

  it("says they can't make one when there are none, with nothing to press", async () => {
    serverWith([], "viewer");
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(MESSAGES.noneHeading);
    expect(screen.getByText(MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.makeOne })).toBeNull();
  });
});

describe("a template's page", () => {
  it("opens the edit screen", async () => {
    serverWith();
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.edit }));
    expect(mockPush).toHaveBeenCalledWith("/reply-templates/t1/edit");
  });

  it("has neither Edit nor Archive for a viewer", async () => {
    serverWith([aReplyTemplate()], "viewer");
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText("Polite decline");
    expect(screen.queryByRole("button", { name: MESSAGES.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.archive })).toBeNull();
  });
});

describe("archiving", () => {
  async function showDetail(server: FakeInquiryServer = serverWith()) {
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText("Polite decline");
    return server;
  }

  async function archive() {
    await fireEvent.press(button(MESSAGES.archive));
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await buttons?.find((choice) => choice.style === "destructive")?.onPress?.();
  }

  it("asks once, even on a double tap, and says what it means", async () => {
    await showDetail();
    await fireEvent.press(button(MESSAGES.archive));
    await fireEvent.press(button(MESSAGES.archive));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, choices] = jest.mocked(Alert.alert).mock.calls[0];
    expect([title, body]).toEqual([archiveTemplateTitle("Polite decline"), MESSAGES.archiveBody]);
    expect(choices?.map((choice) => choice.text)).toEqual(["Cancel", MESSAGES.archive]);
  });

  it("does nothing when I cancel", async () => {
    const server = await showDetail();
    await fireEvent.press(button(MESSAGES.archive));
    jest.mocked(Alert.alert).mock.calls[0][2]?.find((choice) => choice.style === "cancel")?.onPress?.();
    expect(lastInquiryWrite(server)).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("archives it, says so, goes back, and never says it can't find it", async () => {
    const server = await showDetail();
    await archive();
    expect(await screen.findByText(MESSAGES.archived)).toBeTruthy();
    expect(lastInquiryWrite(server)).toEqual({ method: "delete", url: "/reply-templates/t1", body: undefined });
    expect(mockBack).toHaveBeenCalled();
    expect(screen.queryByText(MESSAGES.cantFind)).toBeNull();
    expect(screen.getByTestId("reply-template-detail-skeleton")).toBeTruthy();
  });

  it("counts it as done when the server no longer has it", async () => {
    const server = await showDetail();
    server.templates = [];
    await archive();
    expect(await screen.findByText(MESSAGES.archived)).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
  });

  it("counts it as done when the answer was lost but it was archived", async () => {
    const server = await showDetail();
    server.templateWriteOutcome = "lostAfterSaving";
    await archive();
    expect(await screen.findByText(MESSAGES.archived)).toBeTruthy();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("says it couldn't reach the server when it's still there", async () => {
    const server = await showDetail();
    server.templateWriteOutcome = "lostBeforeSaving";
    await archive();
    expect(await screen.findByText(MESSAGES.archiveUnreachable)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByText("Polite decline")).toBeTruthy();
  });

  it("says it isn't sure when it can't check either", async () => {
    const server = await showDetail();
    server.offline = true;
    await archive();
    expect(await screen.findByText(MESSAGES.archiveUnsure)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each([
    [403, MESSAGES.archiveViewOnly],
    [409, MESSAGES.archiveFailed],
    [500, MESSAGES.archiveFailed],
  ])("says so when the server answers %s, and stays", async (status, words) => {
    const server = await showDetail();
    server.failWritesWith = status;
    await archive();
    expect(await screen.findByText(words)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(button(MESSAGES.archive)).toBeTruthy();
  });

  it("shows Archiving… while it waits", async () => {
    await showDetail();
    const answer = api.defaults.adapter as AxiosAdapter;
    let release = () => {};
    api.defaults.adapter = (config) =>
      config.method === "delete"
        ? new Promise((resolve) => {
            release = () => resolve({ data: undefined, status: 204, statusText: "", headers: {}, config });
          })
        : answer(config);
    await archive();
    expect((await screen.findByRole("button", { name: MESSAGES.archiving })).props.accessibilityState.disabled).toBe(true);
    release();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe("the list after a change", () => {
  async function showListThenHoldReads() {
    serverWith([aReplyTemplate(), aReplyTemplate({ id: "t2", name: "Welcome" })]);
    await show(<ReplyTemplatesScreen />);
    await screen.findByText("Polite decline");
    const answer = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => (config.method === "get" ? new Promise(() => undefined) : answer(config));
  }

  it("shows a rename straight away, before the list reloads", async () => {
    await showListThenHoldReads();
    await act(async () => {
      await store.dispatch(inquiriesApi.endpoints.updateReplyTemplate.initiate({ id: "t1", data: { name: "Kind decline" } }));
    });
    // The cache is written just after the answer lands, so wait for it (reads are held, so it can't be a reload).
    await waitFor(() => expect(screen.getByText("Kind decline")).toBeTruthy());
    expect(screen.queryByText("Polite decline")).toBeNull();
  });

  it("drops an archived one straight away", async () => {
    await showListThenHoldReads();
    await act(async () => {
      await store.dispatch(inquiriesApi.endpoints.archiveReplyTemplate.initiate("t1"));
    });
    await waitFor(() => expect(screen.queryByText("Polite decline")).toBeNull());
    expect(screen.getByText("Welcome")).toBeTruthy();
  });
});
