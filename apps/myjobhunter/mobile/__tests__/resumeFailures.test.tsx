import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import { REFINEMENT_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/refinementPolling";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { File } from "expo-file-system";
import { RESUME_MESSAGES as MESSAGES } from "../src/constants/resume";
import { RESUME_SESSION_ID_KEY } from "../src/constants/resumeStorage";
import { store } from "../src/lib/store";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { refinementSessionRecord, resumeJobRecord } from "../test-support/refinementSessionRecord";
import { renderApp } from "../test-support/renderApp";
import { type HeldRefinementSession, resumeRoutes } from "../test-support/resumeRoutes";
import { storeSession } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { FakeRoute } from "../test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
const mockShareAsync = jest.fn();
jest.mock("expo-sharing", () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args) }));

const SESSION = "/resume-refinement/sessions/rs1";
const RATE_LIMITED = RATE_LIMITED_MESSAGES.resumeRefinement;
const fail = (status: number, detail: unknown = "Anthropic overloaded_error 529") => (): FakeReply => ({ status, data: { detail } });

function serveResume(session: RefinementSession, routes: Record<string, FakeRoute> = {}, jobs: readonly ResumeUploadJob[] = [resumeJobRecord()]) {
  const held: HeldRefinementSession = { current: session };
  return { held, sent: serve(resumeRoutes(jobs, held, routes)) };
}

async function openResume(): Promise<void> {
  await renderApp("/more");
  await fireEvent.press(await screen.findByRole("button", { name: "Resume" }));
  await screen.findByTestId("resume");
}

async function openOnSession(session: RefinementSession, routes: Record<string, FakeRoute> = {}, landsOn = "resume-suggestion") {
  storedItems.set(RESUME_SESSION_ID_KEY, session.id);
  const served = serveResume(session, routes);
  await openResume();
  await screen.findByTestId(landsOn);
  return served;
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  mockShareAsync.mockReset();
  resetFakeFiles();
  store.dispatch(baseApi.util.resetApiState());
});

describe("starting", () => {
  it("says the uploads didn't load, and loads them on Try again", async () => {
    let failing = true;
    serveResume(refinementSessionRecord(), {
      "GET /resume-upload-jobs": (): FakeReply => (failing ? fail(500)() : { status: 200, data: [resumeJobRecord()] }),
    });
    await openResume();

    expect(await screen.findByText(MESSAGES.couldntLoadResumes)).toBeTruthy();
    expect(screen.getByText(MESSAGES.couldntLoadResumesBody)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noResumeBody)).toBeNull();
    failing = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("radio", { name: /ada\.pdf/ })).toBeTruthy();
  });

  it.each([
    [429, RATE_LIMITED],
    [500, MESSAGES.couldntStart],
  ])("says why a start failed with a %s, never in the server's words, and stores nothing", async (status, why) => {
    serveResume(refinementSessionRecord(), { "POST /resume-refinement/sessions": fail(status) });
    await openResume();

    await fireEvent.press(await screen.findByRole("radio", { name: /ada\.pdf/ }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.start }));

    expect(await screen.findByText(why)).toBeTruthy();
    expect(screen.queryByText(/overloaded_error/)).toBeNull();
    expect(await screen.findByRole("button", { name: MESSAGES.start })).toBeEnabled();
    expect(storedItems.has(RESUME_SESSION_ID_KEY)).toBe(false);
  });
});

describe("loading the session", () => {
  it("says a stored session couldn't load, and loads it on Try again", async () => {
    let failing = true;
    storedItems.set(RESUME_SESSION_ID_KEY, "rs1");
    serveResume(refinementSessionRecord(), {
      [`GET ${SESSION}`]: (): FakeReply => (failing ? fail(500)() : { status: 200, data: refinementSessionRecord() }),
    });
    await openResume();

    expect(await screen.findByText(MESSAGES.couldntLoadSession)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.startNew })).toBeTruthy();
    failing = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByTestId("resume-suggestion")).toBeTruthy();
  });

  it("says a session deleted elsewhere is gone, and starts over from there", async () => {
    storedItems.set(RESUME_SESSION_ID_KEY, "rs1");
    serveResume(refinementSessionRecord(), { [`GET ${SESSION}`]: fail(404, "Not found") });
    await openResume();

    expect(await screen.findByText(MESSAGES.sessionGoneHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.startNew }));
    expect(await screen.findByRole("button", { name: MESSAGES.start })).toBeTruthy();
    await waitFor(() => expect(storedItems.has(RESUME_SESSION_ID_KEY)).toBe(false));
  });

  it("says a session deleted elsewhere mid-poll is gone, not offline, and stops asking for it", async () => {
    let gone = false;
    const preparing = refinementSessionRecord({ status: "preparing", improvement_targets: null, pending_proposal: null, proposals_ready_count: 0 });
    const { sent } = await openOnSession(preparing, { [`GET ${SESSION}`]: (): FakeReply => (gone ? fail(404, "Not found")() : { status: 200, data: preparing }) }, "resume-preparing");
    const gets = () => sent.filter(({ route }) => route === `GET ${SESSION}`).length;

    gone = true;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(REFINEMENT_POLL_INTERVAL_MS);
    });

    expect(await screen.findByText(MESSAGES.sessionGoneHeading)).toBeTruthy();
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();
    expect(screen.queryByText(MESSAGES.critiquingHeading)).toBeNull();
    const after = gets();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(REFINEMENT_POLL_INTERVAL_MS * 3);
    });
    expect(gets()).toBe(after);
  });

  it("keeps showing the last session when a poll fails, and says so", async () => {
    let failing = false;
    const preparing = refinementSessionRecord({ status: "preparing", improvement_targets: null, pending_proposal: null, proposals_ready_count: 0 });
    await openOnSession(preparing, { [`GET ${SESSION}`]: (): FakeReply => (failing ? fail(503)() : { status: 200, data: preparing }) }, "resume-preparing");

    failing = true;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(REFINEMENT_POLL_INTERVAL_MS);
    });

    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText(MESSAGES.critiquingHeading)).toBeTruthy();
  });
});

describe("acting on a suggestion", () => {
  it("says a rate-limited accept was rate limited, and keeps the suggestion to try again", async () => {
    await openOnSession(refinementSessionRecord(), { [`POST ${SESSION}/accept`]: fail(429) });

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.accept }));

    expect(await screen.findByText(RATE_LIMITED)).toBeTruthy();
    expect(screen.getByText("Built 12 APIs serving 3M requests a day")).toBeTruthy();
    expect(await screen.findByRole("button", { name: MESSAGES.accept })).toBeEnabled();
  });

  it("says a skip on a session deleted elsewhere is gone", async () => {
    await openOnSession(refinementSessionRecord(), { [`POST ${SESSION}/skip`]: fail(404, "Not found") });

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.skip }));

    expect(await screen.findByText(MESSAGES.sessionGone)).toBeTruthy();
  });

  it("gives back a message the assistant couldn't take, without the server's words", async () => {
    await openOnSession(refinementSessionRecord(), { [`POST ${SESSION}/alternative`]: fail(502) });

    await fireEvent.changeText(screen.getByLabelText(MESSAGES.messageLabel), "no em dashes");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.send }));

    expect(await screen.findByText(MESSAGES.actionFailed)).toBeTruthy();
    expect(screen.queryByText(/overloaded_error/)).toBeNull();
    expect(screen.queryByText(MESSAGES.sending)).toBeNull();
    expect(screen.getByLabelText(MESSAGES.messageLabel).props.value).toBe("no em dashes");
  });

  it("shows a failed rewrite inside its sheet and keeps what was typed", async () => {
    await openOnSession(refinementSessionRecord(), { [`POST ${SESSION}/custom`]: fail(429) });

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.writeMyOwn }));
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.customLabel), "Shipped 12 APIs");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.useMine }));

    expect(await screen.findByText(RATE_LIMITED)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.customLabel).props.value).toBe("Shipped 12 APIs");
    expect(screen.getByRole("button", { name: MESSAGES.useMine })).toBeEnabled();
  });
});

describe("finishing", () => {
  it("says Mark done failed, keeping the button", async () => {
    await openOnSession(refinementSessionRecord({ target_index: 2 }), { [`POST ${SESSION}/complete`]: fail(500) }, "resume-complete");

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.markDone }));

    expect(await screen.findByText(MESSAGES.couldntMarkDone)).toBeTruthy();
    expect(await screen.findByRole("button", { name: MESSAGES.markDone })).toBeEnabled();
  });

  it("says a download failed, opens no share sheet and leaves no file behind", async () => {
    const download = jest.spyOn(File, "downloadFileAsync").mockRejectedValueOnce(new Error("HTTP 500"));
    await openOnSession(refinementSessionRecord({ status: "completed" }), {}, "resume-complete");

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.downloadPdf }));

    expect(await screen.findByText(MESSAGES.couldntDownload)).toBeTruthy();
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(fakeFiles()).toEqual([]);
    expect(screen.getByRole("button", { name: MESSAGES.downloadPdf })).toBeEnabled();
    download.mockRestore();
  });
});
