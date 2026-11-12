import { REFINEMENT_COMPLETION_COPY } from "@myjobhunter/api-client/constants/refinementCompletionCopy";
import { REFINEMENT_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/refinementPolling";
import { REFINEMENT_TOASTS } from "@myjobhunter/api-client/constants/refinementToasts";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
import { baseApi } from "@platform/core/store/baseApi";
import { fakeDownloads, fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { Linking } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../src/constants/resume";
import { RESUME_SESSION_ID_KEY } from "../src/constants/resumeStorage";
import { store } from "../src/lib/store";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { refinementSessionRecord, resumeJobRecord, targetRecord } from "../test-support/refinementSessionRecord";
import { renderApp } from "../test-support/renderApp";
import { type HeldRefinementSession, resumeRoutes } from "../test-support/resumeRoutes";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
const mockShareAsync = jest.fn();
jest.mock("expo-sharing", () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args) }));

const SESSION = "/resume-refinement/sessions/rs1";
const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

function serveResume(session: RefinementSession, routes: Record<string, FakeRoute> = {}, jobs: readonly ResumeUploadJob[] = [resumeJobRecord()]) {
  const held: HeldRefinementSession = { current: session };
  const sent = serve(resumeRoutes(jobs, held, routes));
  return { held, sent };
}

/** Answers with the held session after `change`, as the server does after an action. */
function moves(held: HeldRefinementSession, change: Partial<RefinementSession>): FakeRoute {
  return (): FakeReply => {
    held.current = { ...held.current, ...change };
    return { status: 200, data: held.current };
  };
}

function bodiesTo(sent: ReturnType<typeof serve>, route: string) {
  return sent.filter((request) => request.route === route).map(({ body }) => body);
}

/** Opens Resume from More, as tapping it there does. */
async function openFromMore(): Promise<void> {
  await renderApp("/more");
  await fireEvent.press(await screen.findByRole("button", { name: "Resume" }));
  await screen.findByTestId("resume");
}

/** Opens Resume on a stored session and waits for the card it should land on. */
async function openWithSession(session: RefinementSession, routes: Record<string, FakeRoute> = {}, landsOn = "resume-suggestion") {
  storedItems.set(RESUME_SESSION_ID_KEY, session.id);
  const served = serveResume(session, routes);
  await openFromMore();
  await screen.findByTestId(landsOn);
  return served;
}

async function poll(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(REFINEMENT_POLL_INTERVAL_MS);
  });
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  openURL.mockClear();
  mockShareAsync.mockReset();
  resetFakeFiles();
  store.dispatch(baseApi.util.resetApiState());
});

describe("starting", () => {
  it("opens on the phone from More, picks an upload and starts a session on it", async () => {
    const preparing = refinementSessionRecord({ status: "preparing", improvement_targets: null, pending_proposal: null, proposals_ready_count: 0 });
    const { sent } = serveResume(preparing, {
      "POST /resume-refinement/sessions": (): FakeReply => ({ status: 201, data: preparing }),
    }, [resumeJobRecord(), resumeJobRecord({ id: "job2", file_filename: "old.pdf", status: "failed" })]);
    await openFromMore();

    expect(screen).toHavePathname("/resume");
    expect(openURL).not.toHaveBeenCalled();
    expect(await screen.findByRole("radio", { name: /ada\.pdf, 3 roles, 12 skills/ })).toBeTruthy();
    // An upload that couldn't be read isn't offered, only listed with its status.
    expect(screen.queryByRole("radio", { name: /old\.pdf/ })).toBeNull();
    expect(within(screen.getByLabelText(MESSAGES.uploadsLabel)).getByText(MESSAGES.readFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.start })).toBeDisabled();

    await fireEvent.press(screen.getByRole("radio", { name: /ada\.pdf/ }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.start }));

    expect(await screen.findByText(MESSAGES.critiquingHeading)).toBeTruthy();
    expect(bodiesTo(sent, "POST /resume-refinement/sessions")).toEqual([{ source_resume_job_id: "job1" }]);
    expect(storedItems.get(RESUME_SESSION_ID_KEY)).toBe("rs1");
  });

  it("offers someone with no parsed upload an upload right here, not a trip to Profile", async () => {
    serveResume(refinementSessionRecord(), {}, []);
    await openFromMore();

    expect(await screen.findByText(MESSAGES.noResumeHeading)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.uploadResume })).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.start })).toBeNull();
    expect(screen).toHavePathname("/resume");
  });

  it("reopens the session it was working on, and Start a different session forgets it", async () => {
    await openWithSession(refinementSessionRecord());
    expect(screen.getByText("Built 12 APIs serving 3M requests a day")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.startDifferent }));
    expect(await screen.findByRole("button", { name: MESSAGES.start })).toBeTruthy();
    await waitFor(() => expect(storedItems.has(RESUME_SESSION_ID_KEY)).toBe(false));
  });
});

describe("while it prepares", () => {
  it("follows the poll from the review to the drafting count, then opens the first suggestion", async () => {
    const { held } = await openWithSession(refinementSessionRecord({ status: "preparing", improvement_targets: null, pending_proposal: null, proposals_ready_count: 0 }), {}, "resume-preparing");
    expect(screen.getByText(MESSAGES.critiquingHeading)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.cancel })).toBeTruthy();

    held.current = { ...held.current, improvement_targets: [targetRecord(), targetRecord({ severity: "low" }), targetRecord({ severity: "high" })] };
    await poll();
    expect(await screen.findByText(MESSAGES.draftingHeading(3))).toBeTruthy();
    expect(screen.getByText("2× High impact")).toBeTruthy();
    expect(screen.getByText("1× Low impact")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: MESSAGES.draftedProgress(0, 3) })).toBeTruthy();

    held.current = { ...held.current, status: "active", proposals_ready_count: 1, pending_proposal: "Built 12 APIs" };
    await poll();
    expect(await screen.findByText("Built 12 APIs")).toBeTruthy();
    expect(screen.getByText(MESSAGES.suggestionOf(1, 3))).toBeTruthy();
  });

  it("stops polling while another screen is on top, and picks up again on the way back", async () => {
    const { held, sent } = await openWithSession(refinementSessionRecord({ status: "preparing", improvement_targets: null, pending_proposal: null, proposals_ready_count: 0 }), {}, "resume-preparing");
    const gets = () => sent.filter(({ route }) => route === `GET ${SESSION}`).length;

    await act(async () => router.push("/documents"));
    const away = gets();
    await poll();
    await poll();
    expect(gets()).toBe(away);

    held.current = { ...held.current, improvement_targets: [targetRecord()] };
    await act(async () => router.back());
    await poll();
    expect(await screen.findByText(MESSAGES.draftingHeading(1))).toBeTruthy();
  });

  it("retries a preparation that failed", async () => {
    const failed = refinementSessionRecord({ status: "failed", improvement_targets: null });
    const { sent } = serveResume(failed, { [`POST ${SESSION}/retry-preparation`]: (): FakeReply => ({ status: 200, data: { ...failed, status: "preparing" } }) });
    storedItems.set(RESUME_SESSION_ID_KEY, failed.id);
    await openFromMore();

    expect(await screen.findByText(MESSAGES.failedHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    await waitFor(() => expect(bodiesTo(sent, `POST ${SESSION}/retry-preparation`)).toHaveLength(1));
  });
});

describe("working through the suggestions", () => {
  it("accepts a rewrite, showing the wait the moment it's pressed", async () => {
    const accept = heldReplies();
    await openWithSession(refinementSessionRecord(), { [`POST ${SESSION}/accept`]: accept.route });

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.accept }));
    expect(screen.getByRole("button", { name: MESSAGES.accepting })).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.skip })).toBeDisabled();

    await accept.answer(0, { status: 200, data: refinementSessionRecord({ target_index: 1 }) });
    expect(await screen.findByText(REFINEMENT_TOASTS.applied)).toBeTruthy();
  });

  it("skips to the next one", async () => {
    const { held } = await openWithSession(refinementSessionRecord());
    const sent = serve(resumeRoutes([resumeJobRecord()], held, { [`POST ${SESSION}/skip`]: moves(held, { target_index: 1 }) }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.skip }));

    expect(await screen.findByText(MESSAGES.suggestionOf(2, 2))).toBeTruthy();
    expect(bodiesTo(sent, `POST ${SESSION}/skip`)).toHaveLength(1);
  });

  it("takes a rewrite written in its sheet", async () => {
    const { held } = await openWithSession(refinementSessionRecord());
    const sent = serve(resumeRoutes([resumeJobRecord()], held, { [`POST ${SESSION}/custom`]: moves(held, { target_index: 1, turn_count: 3 }) }));

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.writeMyOwn }));
    const sheet = await screen.findByLabelText(MESSAGES.customLabel);
    expect(screen.getByRole("button", { name: MESSAGES.useMine })).toBeDisabled();
    await fireEvent.changeText(sheet, "  Shipped 12 APIs  ");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.useMine }));

    expect(await screen.findByText(REFINEMENT_TOASTS.customApplied)).toBeTruthy();
    expect(bodiesTo(sent, `POST ${SESSION}/custom`)).toEqual([{ user_text: "Shipped 12 APIs" }]);
    await waitFor(() => expect(screen.queryByLabelText(MESSAGES.customLabel)).toBeNull());
  });

  it("sends a note to the assistant, echoing it until its turn comes back, and asks for another take without one", async () => {
    const alternative = heldReplies();
    const { held, sent } = await openWithSession(refinementSessionRecord(), { [`POST ${SESSION}/alternative`]: alternative.route });

    await fireEvent.changeText(screen.getByLabelText(MESSAGES.messageLabel), "no em dashes");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.send }));
    expect(screen.getByRole("button", { name: MESSAGES.sendingButton })).toBeDisabled();
    expect(screen.getByLabelText(MESSAGES.messageLabel).props.value).toBe("");
    expect(screen.getByLabelText(`${MESSAGES.you}: no em dashes, ${MESSAGES.sending}`)).toBeTruthy();
    expect(screen.getByTestId("resume-regenerating")).toBeTruthy();

    held.current = {
      ...held.current,
      turn_count: 3,
      pending_proposal: "Built 12 APIs, serving 3M requests a day",
      turns: [{ id: "t1", turn_index: 1, role: "user_request_alternative", target_section: "Experience", proposed_text: null, user_text: "no em dashes", rationale: null, clarifying_question: null, created_at: "2026-11-10T00:00:00Z" }],
    };
    await alternative.answer(0, { status: 200, data: held.current });
    expect(await screen.findByText("Built 12 APIs, serving 3M requests a day")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.sending)).toBeNull();
    expect(screen.getByText("no em dashes")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.anotherTake }));
    expect(screen.getByRole("button", { name: MESSAGES.askingButton })).toBeDisabled();
    await alternative.answer(1, { status: 200, data: held.current });
    expect(bodiesTo(sent, `POST ${SESSION}/alternative`)).toEqual([{ hint: "no em dashes" }, { hint: null }]);
  });

  it("moves between suggestions without answering them", async () => {
    const { held } = await openWithSession(refinementSessionRecord());
    const sent = serve(resumeRoutes([resumeJobRecord()], held, { [`POST ${SESSION}/navigate`]: moves(held, { target_index: 1 }) }));

    expect(screen.getByRole("button", { name: MESSAGES.previous })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.next }));
    expect(await screen.findByText(MESSAGES.suggestionOf(2, 2))).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.next })).toBeDisabled();
    expect(bodiesTo(sent, `POST ${SESSION}/navigate`)).toEqual([{ direction: "next" }]);
  });

  it("answers a held rewrite's question by confirming it, and offers Profile for a wrong fact", async () => {
    const { held } = await openWithSession(
      refinementSessionRecord({ pending_proposal: null, pending_clarifying_question: "Was it 12 APIs or 10?", guard_can_force: true }),
    );
    const sent = serve(resumeRoutes([resumeJobRecord()], held, { [`POST ${SESSION}/accept-flagged`]: moves(held, { target_index: 1, pending_clarifying_question: null }) }));

    expect(screen.getByText("Was it 12 APIs or 10?")).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.messageLabel).props.placeholder).toBe(MESSAGES.answerPlaceholder);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.force }));
    expect(await screen.findByText(REFINEMENT_TOASTS.applied)).toBeTruthy();
    expect(bodiesTo(sent, `POST ${SESSION}/accept-flagged`)).toHaveLength(1);
  });

  it("gets a fresh suggestion for a line tapped in the draft, back on Review", async () => {
    const pick = heldReplies();
    const { sent } = await openWithSession(refinementSessionRecord(), { [`POST ${SESSION}/target-from-line`]: pick.route });

    await fireEvent.press(screen.getByRole("tab", { name: "Draft" }));
    const draft = await screen.findByTestId("resume-draft");
    expect(within(draft).getByLabelText(`Built APIs, ${MESSAGES.refiningNow}`)).toBeTruthy();
    // The contact details before the first section can't be picked.
    expect(within(draft).queryByRole("button", { name: "ada@example.com" })).toBeNull();

    await fireEvent.press(within(draft).getByRole("button", { name: "Led a team of four" }));
    expect(await screen.findByTestId("resume-regenerating")).toBeTruthy();
    expect(bodiesTo(sent, `POST ${SESSION}/target-from-line`)).toEqual([{ current_text: "Led a team of four", section: "Experience" }]);
    await pick.answer(0, { status: 200, data: refinementSessionRecord() });
  });
});

describe("finishing", () => {
  it("marks the resume done once every suggestion is through", async () => {
    const { held } = await openWithSession(refinementSessionRecord({ target_index: 2 }), {}, "resume-complete");
    const sent = serve(resumeRoutes([resumeJobRecord()], held, { [`POST ${SESSION}/complete`]: moves(held, { status: "completed" }) }));

    expect(screen.getByText(REFINEMENT_COMPLETION_COPY.reviewed.heading)).toBeTruthy();
    expect(screen.queryByTestId("resume-suggestion")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.markDone }));

    expect(await screen.findByText(REFINEMENT_TOASTS.markedDone)).toBeTruthy();
    expect(await screen.findByRole("button", { name: MESSAGES.downloadPdf })).toBeTruthy();
    expect(bodiesTo(sent, `POST ${SESSION}/complete`)).toHaveLength(1);
  });

  it("says when the review found nothing to change", async () => {
    await openWithSession(refinementSessionRecord({ improvement_targets: [], pending_proposal: null }), {}, "resume-complete");
    expect(screen.getByText(REFINEMENT_COMPLETION_COPY.empty.heading)).toBeTruthy();
  });

  it("downloads the finished resume to the share sheet, signed in, and removes the copy", async () => {
    const download = jest.spyOn(File, "downloadFileAsync");
    mockShareAsync.mockImplementation(async () => {
      expect(fakeFiles()).toHaveLength(1);
    });
    const { sent } = await openWithSession(refinementSessionRecord({ status: "completed", target_index: 2 }), {}, "resume-complete");
    const gets = () => sent.filter(({ route }) => route === `GET ${SESSION}`).length;
    const before = gets();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.downloadDocx }));
    await waitFor(() => expect(mockShareAsync).toHaveBeenCalledTimes(1));

    expect(gets()).toBeGreaterThan(before);
    expect(fakeDownloads()).toEqual(["https://myjobhunter.myfreeapps.org/api/resume-refinement/sessions/rs1/export?format=docx"]);
    expect(download.mock.calls[0]?.[2]?.headers).toEqual({ Authorization: "Bearer a1" });
    expect(mockShareAsync).toHaveBeenCalledWith(expect.stringMatching(/^cache:\/resume-exports\/\d+\/resume\.docx$/), {
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      UTI: "org.openxmlformats.wordprocessingml.document",
    });
    expect(fakeFiles()).toEqual([]);
    download.mockRestore();
  });

  it("keeps a download going, and a second one out, across a switch to Draft and back", async () => {
    let finish: () => void = () => undefined;
    const download = jest.spyOn(File, "downloadFileAsync").mockImplementation(
      async (_url, destination) => new Promise((resolve) => {
        finish = () => resolve(destination as File);
      }),
    );
    await openWithSession(refinementSessionRecord({ status: "completed", target_index: 2 }), {}, "resume-complete");

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.downloadPdf }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole("tab", { name: "Draft" }));
    await screen.findByTestId("resume-draft");
    await fireEvent.press(screen.getByRole("tab", { name: "Review" }));

    expect(await screen.findByRole("button", { name: MESSAGES.preparingDownload })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.downloadDocx }));
    expect(download).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(mockShareAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: MESSAGES.downloadPdf })).toBeEnabled();
    expect(fakeFiles()).toEqual([]);
    download.mockRestore();
  });

  it("stops polling once the session is done", async () => {
    const { sent } = await openWithSession(refinementSessionRecord({ status: "completed", target_index: 2 }), {}, "resume-complete");
    const gets = () => sent.filter(({ route }) => route === `GET ${SESSION}`).length;
    const before = gets();

    await poll();
    await poll();
    await poll();

    expect(gets()).toBe(before);
  });
});
