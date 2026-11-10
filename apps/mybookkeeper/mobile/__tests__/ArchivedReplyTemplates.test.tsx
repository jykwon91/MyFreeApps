import { inquiriesApi } from "@mybookkeeper/api-client/store/inquiriesApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "../src/constants/replyTemplates";
import ArchivedReplyTemplateDetailScreen from "../src/features/replyTemplates/ArchivedReplyTemplateDetailScreen";
import ArchivedReplyTemplatesScreen from "../src/features/replyTemplates/ArchivedReplyTemplatesScreen";
import ReplyTemplatesScreen from "../src/features/replyTemplates/ReplyTemplatesScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aReplyTemplate } from "../test-support/aReplyTemplate";
import { anInquiry, lastInquiryWrite, startInquiryServer, type FakeInquiryServer } from "../test-support/inquiriesServer";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: {
    push: (path: string) => mockPush(path),
    back: () => mockBack(),
    replace: (path: string) => mockReplace(path),
    canGoBack: () => true,
  },
}));

const originalAdapter = api.defaults.adapter;
const active = aReplyTemplate();
const archived = () => aReplyTemplate({ id: "t2", name: "Old decline", is_archived: true });

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

function serverWith(archivedTemplates = [archived()], role = "owner"): FakeInquiryServer {
  const server = startInquiryServer([anInquiry()]);
  server.templates = [aReplyTemplate()];
  server.archivedTemplates = archivedTemplates;
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

/** Holds every read from now on, so nothing on screen can come from a reload. */
function holdReads(): void {
  const answer = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = (config) => (config.method === "get" ? new Promise(() => undefined) : answer(config));
}

const button = (name: string) => screen.getByRole("button", { name });
const patches = (server: FakeInquiryServer) => server.requests.filter((request) => request.method === "patch");

describe("the way in from the templates list", () => {
  it("opens the archived templates", async () => {
    serverWith();
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(active.name);
    await fireEvent.press(button(MESSAGES.archivedLink));
    expect(mockPush).toHaveBeenCalledWith("/reply-templates/archived");
  });

  it("is there when I have no templates, and for a viewer", async () => {
    const server = serverWith([], "viewer");
    server.templates = [];
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(MESSAGES.noneHeading);
    expect(button(MESSAGES.archivedLink)).toBeTruthy();
  });

  it("isn't there while the list can't load", async () => {
    const server = serverWith();
    server.offline = true;
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(MESSAGES.couldntLoadList);
    expect(screen.queryByTestId("archived-templates-link")).toBeNull();
  });
});

describe("the archived templates list", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    serverWith();
    holdReads();
    await show(<ArchivedReplyTemplatesScreen />);
    expect(await screen.findByLabelText(MESSAGES.loadingArchived)).toBeTruthy();
  });

  it("lists only the archived ones, asks the server for them, and opens one", async () => {
    const server = serverWith();
    await show(<ArchivedReplyTemplatesScreen />);
    await screen.findByText("Old decline");
    expect(screen.queryByText(active.name)).toBeNull();
    expect(server.requests.at(-1)?.params).toMatchObject({ include_archived: true });
    expect(screen.getByText(MESSAGES.archivedHeader)).toBeTruthy();
    await fireEvent.press(screen.getByText("Old decline"));
    expect(mockPush).toHaveBeenCalledWith("/reply-templates/archived/t2");
  });

  it("doesn't tell a viewer they can restore", async () => {
    serverWith(undefined, "viewer");
    await show(<ArchivedReplyTemplatesScreen />);
    expect(await screen.findByText(MESSAGES.archivedHeaderViewer)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.archivedHeader)).toBeNull();
  });

  it.each([
    ["owner", MESSAGES.noArchivedBody],
    ["viewer", MESSAGES.noArchivedBodyViewer],
  ])("says there are none for an %s, with nothing to press", async (role, body) => {
    serverWith([], role);
    await show(<ArchivedReplyTemplatesScreen />);
    expect(await screen.findByText(MESSAGES.noArchivedHeading)).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("doesn't read a failed load as 'none', and offers to try again", async () => {
    const server = serverWith();
    server.offline = true;
    await show(<ArchivedReplyTemplatesScreen />);
    await screen.findByText(MESSAGES.couldntLoadArchived);
    expect(screen.queryByText(MESSAGES.noArchivedHeading)).toBeNull();
    server.offline = false;
    await fireEvent.press(button(MESSAGES.tryAgain));
    expect(await screen.findByText("Old decline")).toBeTruthy();
  });

  it("keeps what it had, with a banner, when a reload fails", async () => {
    const server = serverWith();
    await show(<ArchivedReplyTemplatesScreen />);
    await screen.findByText("Old decline");
    server.offline = true;
    await act(async () => {
      await screen.getByTestId("archived-reply-templates-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Old decline")).toBeTruthy();
  });
});

describe("an archived template's page", () => {
  async function showDetail(server: FakeInquiryServer = serverWith()) {
    await show(<ArchivedReplyTemplateDetailScreen id="t2" />);
    await screen.findByText("Old decline");
    return server;
  }

  it("shows it as archived, with its words and a Restore button", async () => {
    await showDetail();
    expect(screen.getByText(MESSAGES.archivedNote)).toBeTruthy();
    expect(screen.getByText(active.subject_template)).toBeTruthy();
    expect(button(MESSAGES.restore)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.edit })).toBeNull();
  });

  it("has no Restore for a viewer", async () => {
    await showDetail(serverWith(undefined, "viewer"));
    expect(screen.queryByRole("button", { name: MESSAGES.restore })).toBeNull();
  });

  it("says it can't find one that isn't archived, and goes back to the archived list", async () => {
    serverWith([]);
    await show(<ArchivedReplyTemplateDetailScreen id="t2" />);
    expect(await screen.findByText(MESSAGES.cantFindArchived)).toBeTruthy();
    expect(screen.getByText(MESSAGES.maybeRestored)).toBeTruthy();
    await fireEvent.press(button(MESSAGES.back));
    expect(mockBack).toHaveBeenCalled();
  });

  it("doesn't read a failed reload as 'can't find' when the list it had is out of date", async () => {
    const server = serverWith([]);
    await show(<ArchivedReplyTemplateDetailScreen id="t2" />);
    await screen.findByText(MESSAGES.cantFindArchived);
    server.archivedTemplates = [archived()];
    server.offline = true;
    await act(async () => {
      await store.dispatch(inquiriesApi.endpoints.getArchivedReplyTemplates.initiate(undefined, { forceRefetch: true }));
    });
    expect(await screen.findByText(MESSAGES.couldntLoadOne)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.cantFindArchived)).toBeNull();
  });

  it("doesn't read a failed load as 'can't find'", async () => {
    const server = serverWith();
    server.offline = true;
    await show(<ArchivedReplyTemplateDetailScreen id="t2" />);
    expect(await screen.findByText(MESSAGES.couldntLoadOne)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.cantFindArchived)).toBeNull();
  });
});

describe("restoring", () => {
  async function showDetail(server: FakeInquiryServer = serverWith()) {
    await show(<ArchivedReplyTemplateDetailScreen id="t2" />);
    await screen.findByText("Old decline");
    return server;
  }

  it("restores it, says so, goes back to the archived list, and never says it can't find it", async () => {
    const server = await showDetail();
    await fireEvent.press(button(MESSAGES.restore));
    expect(await screen.findByText(MESSAGES.restored)).toBeTruthy();
    expect(lastInquiryWrite(server)).toEqual({ method: "patch", url: "/reply-templates/t2", body: { is_archived: false } });
    expect(mockBack).toHaveBeenCalled();
    expect(screen.queryByText(MESSAGES.cantFindArchived)).toBeNull();
    expect(screen.getByTestId("reply-template-detail-skeleton")).toBeTruthy();
    expect(server.templates.map((row) => row.id)).toEqual(["t1", "t2"]);
  });

  it("shows Restoring… and sends once however often it's tapped", async () => {
    const server = await showDetail();
    const answer = api.defaults.adapter as AxiosAdapter;
    let release = () => {};
    api.defaults.adapter = (config) =>
      config.method === "patch"
        ? new Promise((resolve) => {
            release = () => void answer(config).then(resolve);
          })
        : answer(config);
    await fireEvent.press(button(MESSAGES.restore));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.restoring }));
    expect(button(MESSAGES.restoring).props.accessibilityState.disabled).toBe(true);
    release();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(patches(server)).toHaveLength(1);
  });

  it("says it's gone and goes back when the server no longer has it", async () => {
    const server = await showDetail();
    server.archivedTemplates = [];
    await fireEvent.press(button(MESSAGES.restore));
    expect(await screen.findByText(MESSAGES.goneAnymore)).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
    expect(screen.queryByText(MESSAGES.restored)).toBeNull();
  });

  it.each([
    ["the answer was lost after it restored", "lostAfterSaving" as const],
    ["the proxy failed after it restored", "gatewayAfterSaving" as const],
  ])("counts it as done when %s", async (_why, outcome) => {
    const server = await showDetail();
    server.templateWriteOutcome = outcome;
    await fireEvent.press(button(MESSAGES.restore));
    expect(await screen.findByText(MESSAGES.restored)).toBeTruthy();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("says it's still archived when the answer was lost and nothing changed", async () => {
    const server = await showDetail();
    server.templateWriteOutcome = "lostBeforeSaving";
    await fireEvent.press(button(MESSAGES.restore));
    expect(await screen.findByText(MESSAGES.restoreStillArchived)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(button(MESSAGES.restore)).toBeTruthy();
  });

  it("says it's still archived when the server fails and nothing changed", async () => {
    const server = await showDetail();
    server.failWritesWith = 500;
    await fireEvent.press(button(MESSAGES.restore));
    expect(await screen.findByText(MESSAGES.restoreStillArchived)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("says it isn't sure when it can't check either", async () => {
    const server = await showDetail();
    server.offline = true;
    await fireEvent.press(button(MESSAGES.restore));
    expect(await screen.findByText(MESSAGES.restoreUnsure)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each([
    [403, MESSAGES.restoreViewOnly],
    [409, MESSAGES.restoreFailed],
    [422, MESSAGES.restoreFailed],
  ])("says so when the server answers %s, and stays", async (status, words) => {
    const server = await showDetail();
    server.failWritesWith = status;
    await fireEvent.press(button(MESSAGES.restore));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.queryByText(/nope/)).toBeNull();
  });
});
