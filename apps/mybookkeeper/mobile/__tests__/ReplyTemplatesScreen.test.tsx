import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { inquiriesApi } from "@mybookkeeper/api-client/store/inquiriesApi";
import { replyTemplatePreview } from "@mybookkeeper/api-client/utils/replyTemplatePreview";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import type { ReactElement } from "react";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { REPLY_TEMPLATE_MESSAGES } from "../src/constants/replyTemplates";
import { variablesUsed } from "../src/features/replyTemplates/replyTemplateDisplay";
import ReplyTemplateDetailScreen from "../src/features/replyTemplates/ReplyTemplateDetailScreen";
import ReplyTemplatesScreen from "../src/features/replyTemplates/ReplyTemplatesScreen";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));

const originalAdapter = api.defaults.adapter;

function aTemplate(overrides: Partial<ReplyTemplate> = {}): ReplyTemplate {
  return {
    id: "t1",
    organization_id: "o",
    user_id: "u",
    name: "Polite decline",
    subject_template: "About $listing",
    body_template: "Hi $name,\n\nSorry, it's taken.\n\n- $host_name",
    is_archived: false,
    display_order: 0,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

function startServer(answer: unknown) {
  const server = { answer };
  const adapter: AxiosAdapter = async (config) => {
    if (server.answer === "hold") return new Promise(() => undefined);
    if (server.answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    return { data: server.answer, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(element: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockClear();
  mockBack.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("replyTemplatePreview", () => {
  it("joins the first two lines with words on them", () => {
    expect(replyTemplatePreview("Hi $name,\n\n  \nThanks.\nThird")).toBe("Hi $name, Thanks.");
  });

  it("shortens a long one", () => {
    expect(replyTemplatePreview("a".repeat(130))).toBe(`${"a".repeat(120)}...`);
  });
});

describe("variablesUsed", () => {
  it("finds what's in the subject and the message, in the order they're listed", () => {
    expect(variablesUsed(aTemplate()).map((variable) => variable.token)).toEqual(["$name", "$listing", "$host_name"]);
  });

  it("counts a variable with a letter stuck on the end, because that's still filled in", () => {
    expect(variablesUsed(aTemplate({ subject_template: "Hi", body_template: "$names" })).map((variable) => variable.token)).toEqual(["$name"]);
  });

  it("is empty when there are none", () => {
    expect(variablesUsed(aTemplate({ subject_template: "Hi", body_template: "Hello" }))).toEqual([]);
  });
});

describe("ReplyTemplatesScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<ReplyTemplatesScreen />);
    expect(await screen.findByTestId("reply-templates-skeleton")).toBeTruthy();
  });

  it("lists a template with its preview, and opens it", async () => {
    startServer([aTemplate()]);
    await show(<ReplyTemplatesScreen />);
    await screen.findByText("Polite decline");
    expect(screen.getByText("Hi $name, Sorry, it's taken.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Polite decline. Hi $name, Sorry, it's taken." }));
    expect(mockPush).toHaveBeenCalledWith("/reply-templates/t1");
  });

  it("says there are none, and offers nothing to make one without write access", async () => {
    startServer([]);
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(REPLY_TEMPLATE_MESSAGES.noneHeading);
    expect(screen.getByText(REPLY_TEMPLATE_MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByRole("button", { name: REPLY_TEMPLATE_MESSAGES.makeOne })).toBeNull();
    expect(screen.queryByRole("button", { name: REPLY_TEMPLATE_MESSAGES.newTemplate })).toBeNull();
  });

  it("keeps saying there are none during a reload", async () => {
    const server = startServer([]);
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(REPLY_TEMPLATE_MESSAGES.noneHeading);
    server.answer = "hold";
    await act(async () => {
      void store.dispatch(inquiriesApi.endpoints.getReplyTemplates.initiate(undefined, { forceRefetch: true }));
    });
    expect(screen.getByText(REPLY_TEMPLATE_MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByTestId("reply-templates-skeleton")).toBeNull();
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer("fail");
    await show(<ReplyTemplatesScreen />);
    await screen.findByText(REPLY_TEMPLATE_MESSAGES.couldntLoadList);
    expect(screen.queryByText(REPLY_TEMPLATE_MESSAGES.noneHeading)).toBeNull();
    server.answer = [aTemplate()];
    await fireEvent.press(screen.getByRole("button", { name: REPLY_TEMPLATE_MESSAGES.tryAgain }));
    await screen.findByText("Polite decline");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer([aTemplate()]);
    await show(<ReplyTemplatesScreen />);
    await screen.findByText("Polite decline");
    server.answer = "fail";
    await act(async () => {
      await screen.getByTestId("reply-templates-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Polite decline")).toBeTruthy();
  });
});

describe("ReplyTemplateDetailScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<ReplyTemplateDetailScreen id="t1" />);
    expect(await screen.findByTestId("reply-template-detail-skeleton")).toBeTruthy();
  });

  it("shows the words exactly as written, with what each variable fills in", async () => {
    startServer([aTemplate({ body_template: "Hi $name,\n\n- **soon**" })]);
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText("Polite decline");
    expect(screen.getByText("About $listing")).toBeTruthy();
    expect(screen.getByText("Hi $name,\n\n- **soon**").props.selectable).toBe(true);
    expect(screen.getByText("$name")).toBeTruthy();
    expect(screen.getByText("$listing")).toBeTruthy();
    expect(screen.queryByText("$employer")).toBeNull();
  });

  it("leaves out the variables section when there are none", async () => {
    startServer([aTemplate({ subject_template: "Hi", body_template: "Hello" })]);
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText("Polite decline");
    expect(screen.queryByText(REPLY_TEMPLATE_MESSAGES.variablesHeading)).toBeNull();
  });

  it("waits for a reload before saying a template isn't there", async () => {
    const server = startServer([aTemplate({ id: "other" })]);
    await act(async () => {
      await store.dispatch(inquiriesApi.endpoints.getReplyTemplates.initiate());
    });
    server.answer = "hold";
    void store.dispatch(inquiriesApi.endpoints.getReplyTemplates.initiate(undefined, { forceRefetch: true }));
    await show(<ReplyTemplateDetailScreen id="t1" />);
    expect(await screen.findByTestId("reply-template-detail-skeleton")).toBeTruthy();
    expect(screen.queryByText(REPLY_TEMPLATE_MESSAGES.cantFind)).toBeNull();
  });

  it("says when the template isn't there, and offers a way back", async () => {
    startServer([aTemplate({ id: "other" })]);
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText(REPLY_TEMPLATE_MESSAGES.cantFind);
    await fireEvent.press(screen.getByRole("button", { name: REPLY_TEMPLATE_MESSAGES.back }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer("fail");
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText(REPLY_TEMPLATE_MESSAGES.couldntLoadOne);
    server.answer = [aTemplate()];
    await fireEvent.press(screen.getByRole("button", { name: REPLY_TEMPLATE_MESSAGES.tryAgain }));
    await screen.findByText("Polite decline");
  });

  it("keeps what it had when a reload fails", async () => {
    const server = startServer([aTemplate()]);
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText("Polite decline");
    server.answer = "fail";
    await act(async () => {
      await store.dispatch(inquiriesApi.endpoints.getReplyTemplates.initiate(undefined, { forceRefetch: true }));
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Polite decline")).toBeTruthy();
  });

  it("has no way to edit or archive without write access", async () => {
    startServer([aTemplate()]);
    await show(<ReplyTemplateDetailScreen id="t1" />);
    await screen.findByText("Polite decline");
    expect(screen.queryByRole("button", { name: REPLY_TEMPLATE_MESSAGES.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: REPLY_TEMPLATE_MESSAGES.archive })).toBeNull();
  });
});
