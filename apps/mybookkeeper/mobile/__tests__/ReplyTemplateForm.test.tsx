import { inquiriesApi } from "@mybookkeeper/api-client/store/inquiriesApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { REPLY_TEMPLATE_BODY_MAX_LENGTH, REPLY_TEMPLATE_MESSAGES as MESSAGES } from "../src/constants/replyTemplates";
import ReplyTemplateCreateScreen from "../src/features/replyTemplates/ReplyTemplateCreateScreen";
import ReplyTemplateEditScreen from "../src/features/replyTemplates/ReplyTemplateEditScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aReplyTemplate } from "../test-support/aReplyTemplate";
import { anInquiry, lastInquiryWrite, startInquiryServer, type FakeInquiryServer } from "../test-support/inquiriesServer";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), replace: (path: string) => mockReplace(path), canGoBack: () => true },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

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

function serverWith(templates = [aReplyTemplate()]): FakeInquiryServer {
  const server = startInquiryServer([anInquiry()]);
  server.templates = templates;
  return server;
}

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

const nameInput = () => screen.getByLabelText("Name, required");
const subjectInput = () => screen.getByLabelText("Subject, required");
const messageInput = () => screen.getByLabelText("Message, required");
const saveButton = (label: string = MESSAGES.saveTemplate) => screen.getByRole("button", { name: label });
const writes = (server: FakeInquiryServer, method: string) => server.requests.filter((request) => request.method === method);

/** Reads carry on. A write is counted and waits for `release`, so a test can look at the screen mid-save. */
function holdPosts(): { posts: AxiosRequestConfig[]; release: () => void } {
  const answer = api.defaults.adapter as AxiosAdapter;
  const posts: AxiosRequestConfig[] = [];
  const waiting: Array<() => void> = [];
  api.defaults.adapter = (config) => {
    if (config.method?.toLowerCase() === "get") return answer(config);
    posts.push(config);
    return new Promise((resolve) => {
      waiting.push(() => resolve({ data: aReplyTemplate({ id: "made" }), status: 201, statusText: "", headers: {}, config }));
    });
  };
  return { posts, release: () => waiting.forEach((resolve) => resolve()) };
}

async function showCreate() {
  await show(<ReplyTemplateCreateScreen />);
  await screen.findByLabelText("Name, required");
}

async function fill(name = "Welcome", subject = "About $listing", body = "Hi $name") {
  await fireEvent.changeText(nameInput(), name);
  await fireEvent.changeText(subjectInput(), subject);
  await fireEvent.changeText(messageInput(), body);
}

describe("making a template", () => {
  it("sends exactly the three fields, tidied, then says so and leaves", async () => {
    const server = serverWith([]);
    await showCreate();
    await fill("  Welcome ", " About\n$listing ", "\nHi $name\n");
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.templateSaved)).toBeTruthy();
    expect(lastInquiryWrite(server)).toEqual({
      method: "post",
      url: "/reply-templates",
      body: { name: "Welcome", subject_template: "About $listing", body_template: "Hi $name" },
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("shows all three problems after the first tap, and sends nothing", async () => {
    const server = serverWith([]);
    await showCreate();
    expect(screen.queryByText(MESSAGES.nameRequired)).toBeNull();
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.nameRequired)).toBeTruthy();
    expect(screen.getByText(MESSAGES.subjectRequired)).toBeTruthy();
    expect(screen.getByText(MESSAGES.messageRequired)).toBeTruthy();
    expect(writes(server, "post")).toHaveLength(0);
  });

  it("treats spaces alone as empty", async () => {
    const server = serverWith([]);
    await showCreate();
    await fill("   ", "  ", "\n\n");
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.nameRequired)).toBeTruthy();
    expect(writes(server, "post")).toHaveLength(0);
  });

  it("says a name is taken by another template without asking the server", async () => {
    const server = serverWith();
    await showCreate();
    await fill("Polite decline");
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.nameClash)).toBeTruthy();
    expect(writes(server, "post")).toHaveLength(0);
  });

  it("says so beside the name when the server finds it taken, and never shows the server's words", async () => {
    const server = serverWith([]);
    server.archivedTemplates = [aReplyTemplate({ id: "old", name: "Old one", is_archived: true })];
    await showCreate();
    await fill("Old one");
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.nameTaken)).toBeTruthy();
    expect(screen.queryByText(/already exists/)).toBeNull();
    expect(screen.queryByText(MESSAGES.templateSaved)).toBeNull();
    await fireEvent.changeText(nameInput(), "Another");
    expect(screen.queryByText(MESSAGES.nameTaken)).toBeNull();
  });

  it("shows Saving…, locks the fields, and sends once however often it's tapped", async () => {
    serverWith([]);
    await showCreate();
    await fill();
    const { posts, release } = holdPosts();
    await fireEvent.press(saveButton());
    await fireEvent.press(saveButton("Saving…"));
    await fireEvent.press(saveButton("Saving…"));
    expect(saveButton("Saving…").props.accessibilityState.disabled).toBe(true);
    expect(nameInput().props.editable).toBe(false);
    expect(posts).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add $name" }).props.accessibilityState.disabled).toBe(true);
    release();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it.each([
    [500, MESSAGES.saveFailed],
    [422, MESSAGES.saveFailed],
    [403, MESSAGES.saveViewOnly],
  ])("keeps what was typed and says so when the server answers %s", async (status, words) => {
    const server = serverWith([]);
    await showCreate();
    await fill();
    server.failWritesWith = status;
    await fireEvent.press(saveButton());
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.getByDisplayValue("Welcome")).toBeTruthy();
    expect(saveButton().props.accessibilityState.disabled).toBeFalsy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("can be tried again after a failure", async () => {
    const server = serverWith([]);
    await showCreate();
    await fill();
    server.failWritesWith = 500;
    await fireEvent.press(saveButton());
    await screen.findByText(MESSAGES.saveFailed);
    server.failWritesWith = null;
    await fireEvent.press(saveButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(server.templates).toHaveLength(1);
  });

  it("says it can't reach the server when nothing answers, and keeps the template", async () => {
    const server = serverWith([]);
    await showCreate();
    await fill();
    server.templateWriteOutcome = "lostBeforeSaving";
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.couldntReach)).toBeTruthy();
    expect(screen.getByDisplayValue("Welcome")).toBeTruthy();
    expect(server.templates).toHaveLength(0);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("counts it as saved when the answer was lost but the template landed", async () => {
    const server = serverWith([]);
    await showCreate();
    await fill();
    server.templateWriteOutcome = "lostAfterSaving";
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.templateSaved)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntReach)).toBeNull();
    expect(server.templates).toHaveLength(1);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("counts it as saved when the proxy errored after the template landed", async () => {
    const server = serverWith([]);
    await showCreate();
    await fill();
    server.templateWriteOutcome = "gatewayAfterSaving";
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.templateSaved)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.saveFailed)).toBeNull();
    expect(server.templates).toHaveLength(1);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("says it isn't sure, rather than not saved, when it can't check either", async () => {
    const server = serverWith([]);
    await showCreate();
    await fill();
    server.templateWriteOutcome = "lostAndOffline";
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.saveUnsure)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntReach)).toBeNull();
    expect(screen.getByDisplayValue("Welcome")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("leaving the new template screen", () => {
  it("asks first once something's typed, and Discard really leaves", async () => {
    serverWith([]);
    await showCreate();
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(nameInput(), "W");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    const [title, body, buttons] = jest.mocked(Alert.alert).mock.calls[0];
    expect([title, body]).toEqual([MESSAGES.discardTitle, MESSAGES.discardBody]);
    expect(buttons?.map((button) => button.text)).toEqual([MESSAGES.keepEditing, MESSAGES.discard]);
    expect(mockDispatch).not.toHaveBeenCalled();
    buttons?.find((button) => button.style === "destructive")?.onPress?.();
    expect(mockDispatch).toHaveBeenCalledWith("go-back");
  });

  it("stays when asked to keep editing", async () => {
    serverWith([]);
    await showCreate();
    await fireEvent.changeText(nameInput(), "W");
    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    jest.mocked(Alert.alert).mock.calls[0][2]?.find((button) => button.style === "cancel")?.onPress?.();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(nameInput().props.value).toBe("W");
  });

  it("lets go without asking when nothing was typed, or when a save is on its way", async () => {
    serverWith([]);
    await showCreate();
    expect(mockPreventRemove.active).toBe(false);
    await fill();
    const { release } = holdPosts();
    await fireEvent.press(saveButton());
    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    expect(Alert.alert).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("doesn't ask once it's saved", async () => {
    serverWith([]);
    await showCreate();
    await fill();
    await fireEvent.press(saveButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockPreventRemove.active).toBe(false);
  });
});

describe("adding a variable", () => {
  async function selectIn(input: ReturnType<typeof messageInput>, start: number, end = start) {
    await fireEvent(input, "focus");
    await fireEvent(input, "selectionChange", { nativeEvent: { selection: { start, end } } });
  }

  it("goes into the message at the cursor, by default the message", async () => {
    serverWith([]);
    await showCreate();
    expect(screen.getByText(MESSAGES.addToMessage)).toBeTruthy();
    await fireEvent.changeText(messageInput(), "Hi ,");
    await selectIn(messageInput(), 3);
    await fireEvent.press(screen.getByRole("button", { name: "Add $name" }));
    expect(messageInput().props.value).toBe("Hi $name,");
    expect(messageInput().props.selection).toEqual({ start: 8, end: 8 });
  });

  it("goes at the end of the message when the cursor hasn't been placed", async () => {
    serverWith([]);
    await showCreate();
    await fireEvent.changeText(messageInput(), "Hi");
    await fireEvent.press(screen.getByRole("button", { name: "Add $name" }));
    expect(messageInput().props.value).toBe("Hi $name");
  });

  it("goes into whichever of subject and message was used last, and says which", async () => {
    serverWith([]);
    await showCreate();
    await fireEvent.changeText(subjectInput(), "About ");
    await selectIn(subjectInput(), 6);
    expect(screen.getByText(MESSAGES.addToSubject)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add $listing" }));
    expect(subjectInput().props.value).toBe("About $listing");
    expect(messageInput().props.value).toBe("");
  });

  it("replaces a selection, and spaces it from the words round it", async () => {
    serverWith([]);
    await showCreate();
    await fireEvent.changeText(messageInput(), "HiXXbye");
    await selectIn(messageInput(), 2, 4);
    await fireEvent.press(screen.getByRole("button", { name: "Add $name" }));
    expect(messageInput().props.value).toBe("Hi $name bye");
  });

  it("explains what each one fills in", async () => {
    serverWith([]);
    await showCreate();
    expect(screen.getByRole("button", { name: "Add $dates" }).props.accessibilityHint).toMatch(/dates they asked for/);
  });

  it("tells me and changes nothing when it wouldn't fit", async () => {
    serverWith([]);
    await showCreate();
    const full = "a".repeat(REPLY_TEMPLATE_BODY_MAX_LENGTH - 2);
    await fireEvent.changeText(messageInput(), full);
    await fireEvent.press(screen.getByRole("button", { name: "Add $name" }));
    expect(await screen.findByText(MESSAGES.tooLong)).toBeTruthy();
    expect(messageInput().props.value).toBe(full);
  });

  it("makes dirty what it added", async () => {
    serverWith([]);
    await showCreate();
    await fireEvent.press(screen.getByRole("button", { name: "Add $name" }));
    expect(mockPreventRemove.active).toBe(true);
  });
});

describe("hints under the message", () => {
  it("counts from 9,000 characters, and not before", async () => {
    serverWith([]);
    await showCreate();
    await fireEvent.changeText(messageInput(), "a".repeat(8999));
    expect(screen.queryByText(/of 10,000/)).toBeNull();
    await fireEvent.changeText(messageInput(), "a".repeat(9420));
    expect(screen.getByText("9,420 of 10,000")).toBeTruthy();
  });

  it("says when a word looks like a variable but isn't one, and leaves prices alone", async () => {
    serverWith([]);
    await showCreate();
    await fireEvent.changeText(messageInput(), "Rent is $500, plus $price.");
    expect(screen.getByText("I don't recognize $price, so I'll leave it as you typed it.")).toBeTruthy();
    await fireEvent.changeText(messageInput(), "Rent is $500 for $name.");
    expect(screen.queryByText(/I don't recognize/)).toBeNull();
  });

  it("lists what the variables fill in", async () => {
    serverWith([]);
    await showCreate();
    expect(screen.queryByText("I leave this blank for now.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.variablesHelp }));
    expect(screen.getByText("I leave this blank for now.")).toBeTruthy();
  });

  it("limits the lengths to the server's", async () => {
    serverWith([]);
    await showCreate();
    expect([nameInput(), subjectInput(), messageInput()].map((input) => input.props.maxLength)).toEqual([100, 500, 10000]);
  });
});

describe("changing a template", () => {
  async function showEdit(id = "t1") {
    await show(<ReplyTemplateEditScreen id={id} />);
    await screen.findByLabelText("Name, required");
  }

  it("fills the form with what's there", async () => {
    serverWith();
    await showEdit();
    expect(nameInput().props.value).toBe("Polite decline");
    expect(subjectInput().props.value).toBe("About $listing");
    expect(saveButton(MESSAGES.saveChanges)).toBeTruthy();
  });

  it("sends only what changed, says so and leaves", async () => {
    const server = serverWith();
    await showEdit();
    await fireEvent.changeText(subjectInput(), "Re: $listing");
    await fireEvent.press(saveButton(MESSAGES.saveChanges));
    expect(await screen.findByText(MESSAGES.changesSaved)).toBeTruthy();
    expect(lastInquiryWrite(server)).toEqual({ method: "patch", url: "/reply-templates/t1", body: { subject_template: "Re: $listing" } });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("doesn't count spaces or a newline already at the ends as a change", async () => {
    const server = serverWith([aReplyTemplate({ body_template: "Hi $name\n" })]);
    await showEdit();
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.press(saveButton(MESSAGES.saveChanges));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastInquiryWrite(server)).toBeNull();
  });

  it("sends nothing and just leaves when nothing changed", async () => {
    const server = serverWith();
    await showEdit();
    await fireEvent.changeText(nameInput(), " Polite decline ");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.press(saveButton(MESSAGES.saveChanges));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastInquiryWrite(server)).toBeNull();
  });

  it("lets me keep the name it has, and refuses another template's", async () => {
    const server = serverWith([aReplyTemplate(), aReplyTemplate({ id: "t2", name: "Welcome" })]);
    await showEdit();
    await fireEvent.changeText(nameInput(), "Welcome");
    await fireEvent.press(saveButton(MESSAGES.saveChanges));
    expect(await screen.findByText(MESSAGES.nameClash)).toBeTruthy();
    expect(lastInquiryWrite(server)).toBeNull();
    await fireEvent.changeText(nameInput(), "Polite decline");
    await fireEvent.changeText(messageInput(), "New words");
    await fireEvent.press(saveButton(MESSAGES.saveChanges));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("says a rename to an archived template's name is taken", async () => {
    const server = serverWith();
    server.archivedTemplates = [aReplyTemplate({ id: "gone", name: "Gone", is_archived: true })];
    await showEdit();
    await fireEvent.changeText(nameInput(), "Gone");
    await fireEvent.press(saveButton(MESSAGES.saveChanges));
    expect(await screen.findByText(MESSAGES.nameTaken)).toBeTruthy();
  });

  it("says it's gone and leaves without asking when the server no longer has it", async () => {
    const server = serverWith();
    await showEdit();
    await fireEvent.changeText(nameInput(), "Kind decline");
    server.templates = [];
    await fireEvent.press(saveButton(MESSAGES.saveChanges));
    expect(await screen.findByText(MESSAGES.goneAnymore)).toBeTruthy();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockPreventRemove.active).toBe(false);
  });

  it("keeps typing when the list reloads underneath", async () => {
    const server = serverWith();
    await showEdit();
    await fireEvent.changeText(nameInput(), "Mine");
    server.templates = [aReplyTemplate({ name: "Changed elsewhere" })];
    await act(async () => {
      await store.dispatch(inquiriesApi.endpoints.getReplyTemplates.initiate(undefined, { forceRefetch: true }));
    });
    expect(nameInput().props.value).toBe("Mine");
  });

  it("asks before throwing away a change", async () => {
    serverWith();
    await showEdit();
    await fireEvent.changeText(messageInput(), "Different");
    expect(mockPreventRemove.active).toBe(true);
  });
});

describe("the edit and new screens", () => {
  it("show a skeleton while the template is on its way", async () => {
    serverWith();
    const answer = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => (config.url === "/reply-templates" ? new Promise(() => undefined) : answer(config));
    await show(<ReplyTemplateEditScreen id="t1" />);
    expect(await screen.findByTestId("reply-template-form-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.cantFind)).toBeNull();
  });

  it("say when the template isn't there, and offer a way back", async () => {
    serverWith([aReplyTemplate({ id: "other" })]);
    await show(<ReplyTemplateEditScreen id="t1" />);
    await screen.findByText(MESSAGES.cantFind);
    expect(screen.getByText(MESSAGES.maybeArchived)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.back }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("don't read a failed load as 'not found', and recover on a retry", async () => {
    const server = serverWith();
    server.offline = true;
    await show(<ReplyTemplateEditScreen id="t1" />);
    await screen.findByText(MESSAGES.couldntLoadOne);
    expect(screen.queryByText(MESSAGES.cantFind)).toBeNull();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    await screen.findByLabelText("Name, required");
  });

  it("turn a viewer away from the edit screen", async () => {
    const server = serverWith();
    server.role = "viewer";
    await show(<ReplyTemplateEditScreen id="t1" />);
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.getByText(MESSAGES.viewOnlyBody)).toBeTruthy();
    expect(screen.queryByLabelText("Name, required")).toBeNull();
  });

  it("turn a viewer away from the new screen", async () => {
    const server = serverWith();
    server.role = "viewer";
    await show(<ReplyTemplateCreateScreen />);
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.queryByLabelText("Name, required")).toBeNull();
  });
});
