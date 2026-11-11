import "@platform/mobile/test-support/reactNativeFormData";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import { RESUME_JOBS_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/resumeJobsPolling";
import { RESUME_UPLOAD_MAX_BYTES, RESUME_UPLOAD_MIME_TYPES } from "@myjobhunter/api-client/constants/resumeUploadLimits";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { RESUME_MESSAGES as MESSAGES } from "../src/constants/resume";
import { store } from "../src/lib/store";
import { serve } from "../test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "../test-support/memorySecureStore";
import { refinementSessionRecord, resumeJobRecord } from "../test-support/refinementSessionRecord";
import { renderApp } from "../test-support/renderApp";
import { resumeRoutes } from "../test-support/resumeRoutes";
import { storeSession } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { FakeRoute } from "../test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const PDF = "application/pdf";
const QUEUED = resumeJobRecord({ id: "job-new", file_filename: "ada-2026.pdf", status: "queued", result_parsed_fields: null });

/** The uploads the server lists; a test changes `current` to have the next poll or refetch return it. */
function serveUploads(initial: readonly ResumeUploadJob[], routes: Record<string, FakeRoute> = {}) {
  const jobs = { current: initial };
  const sent = serve(resumeRoutes([], { current: refinementSessionRecord() }, {
    "GET /resume-upload-jobs": (): FakeReply => ({ status: 200, data: jobs.current }),
    ...routes,
  }));
  return { jobs, sent };
}

function pick(asset: Partial<DocumentPicker.DocumentPickerAsset> & Pick<DocumentPicker.DocumentPickerAsset, "name">): void {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: `file:///cache/${asset.name}`, lastModified: 0, ...asset }],
  });
}

async function openResume(): Promise<void> {
  await renderApp("/more");
  await fireEvent.press(await screen.findByRole("button", { name: "Resume" }));
  await screen.findByTestId("resume");
}

function uploadsSent(sent: ReturnType<typeof serve>) {
  return sent.filter(({ route }) => route === "POST /resumes");
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.mocked(DocumentPicker.getDocumentAsync).mockReset();
  store.dispatch(baseApi.util.resetApiState());
});

describe("uploading a resume on Resume", () => {
  it("uploads a picked file, follows it being read, then starts a session on it", async () => {
    const upload = heldReplies();
    const { jobs, sent } = serveUploads([], {
      "POST /resumes": upload.route,
      "POST /resume-refinement/sessions": (): FakeReply => ({ status: 201, data: refinementSessionRecord({ source_resume_job_id: "job-new" }) }),
    });
    await openResume();
    expect(await screen.findByText(MESSAGES.noResumeHeading)).toBeTruthy();

    pick({ name: "ada-2026.pdf", mimeType: PDF, size: 2048 });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.uploadResume }));

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({ type: [...RESUME_UPLOAD_MIME_TYPES], copyToCacheDirectory: true });
    await waitFor(() => expect(uploadsSent(sent)).toHaveLength(1));
    expect(screen.getByRole("button", { name: MESSAGES.uploading })).toBeDisabled();
    const form = uploadsSent(sent)[0].data as FormData;
    expect(form.getAll("file")).toEqual([{ uri: "file:///cache/ada-2026.pdf", name: "ada-2026.pdf", type: PDF }]);

    jobs.current = [QUEUED];
    await upload.answer(0, { status: 201, data: QUEUED });
    expect(await screen.findByText(MESSAGES.uploaded("ada-2026.pdf"))).toBeTruthy();
    expect(await screen.findByText(MESSAGES.readingHeading)).toBeTruthy();
    const row = within(screen.getByLabelText(MESSAGES.uploadsLabel)).getByTestId("resume-upload-status");
    expect(within(row).getByText("ada-2026.pdf")).toBeTruthy();
    expect(within(row).getByText("Queued")).toBeTruthy();

    jobs.current = [{ ...QUEUED, status: "processing" }];
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RESUME_JOBS_POLL_INTERVAL_MS);
    });
    expect(await screen.findByText("Processing")).toBeTruthy();

    jobs.current = [resumeJobRecord({ id: "job-new", file_filename: "ada-2026.pdf" })];
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RESUME_JOBS_POLL_INTERVAL_MS);
    });
    // The file just uploaded is chosen for the person once it's read.
    expect(await screen.findByRole("radio", { name: /ada-2026\.pdf/, checked: true })).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.uploadsLabel)).toBeNull();

    // Nothing left to read: the list stops polling.
    const listed = () => sent.filter(({ route }) => route === "GET /resume-upload-jobs").length;
    const before = listed();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RESUME_JOBS_POLL_INTERVAL_MS * 3);
    });
    expect(listed()).toBe(before);

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.start }));
    await waitFor(() =>
      expect(sent.filter(({ route }) => route === "POST /resume-refinement/sessions").map(({ body }) => body)).toEqual([{ source_resume_job_id: "job-new" }]),
    );
  });

  it("keeps one upload at a time when a read finishes mid-upload and the buttons swap", async () => {
    const upload = heldReplies();
    const { jobs, sent } = serveUploads([QUEUED], { "POST /resumes": upload.route });
    await openResume();
    expect(await screen.findByText(MESSAGES.readingHeading)).toBeTruthy();

    pick({ name: "second.pdf", mimeType: PDF, size: 2048 });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.uploadResume }));
    await waitFor(() => expect(uploadsSent(sent)).toHaveLength(1));

    // The first upload is read while the second is still going up: the empty state gives way to the list.
    jobs.current = [resumeJobRecord({ id: "job-new", file_filename: "ada-2026.pdf" })];
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RESUME_JOBS_POLL_INTERVAL_MS);
    });
    expect(await screen.findByRole("radio", { name: /ada-2026\.pdf/ })).toBeTruthy();

    const another = screen.getByRole("button", { name: MESSAGES.uploading });
    expect(another).toBeDisabled();
    await fireEvent.press(another);
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);

    await upload.answer(0, { status: 201, data: { ...QUEUED, id: "job-second", file_filename: "second.pdf" } });
    expect(await screen.findByRole("button", { name: MESSAGES.uploadAnother })).toBeEnabled();
  });

  it.each([
    ["reports no size", { name: "ada.pdf", mimeType: PDF }, PDF],
    ["names no type it knows", { name: "ada.docx", mimeType: "application/octet-stream", size: 2048 }, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("sends a file whose picker %s, typed by its name", async (_what, asset, type) => {
    const { sent } = serveUploads([], { "POST /resumes": (): FakeReply => ({ status: 201, data: QUEUED }) });
    await openResume();

    pick(asset);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.uploadResume }));

    expect(await screen.findByText(MESSAGES.uploaded(asset.name))).toBeTruthy();
    const form = uploadsSent(sent)[0].data as FormData;
    expect(form.getAll("file")).toEqual([{ uri: `file:///cache/${asset.name}`, name: asset.name, type }]);
  });

  it("stops polling the uploads while another screen is on top, and picks up again on the way back", async () => {
    const { jobs, sent } = serveUploads([QUEUED]);
    await openResume();
    expect(await screen.findByText(MESSAGES.readingHeading)).toBeTruthy();
    const listed = () => sent.filter(({ route }) => route === "GET /resume-upload-jobs").length;

    await act(async () => router.push("/documents"));
    const away = listed();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RESUME_JOBS_POLL_INTERVAL_MS * 3);
    });
    expect(listed()).toBe(away);

    jobs.current = [resumeJobRecord({ id: "job-new", file_filename: "ada-2026.pdf" })];
    await act(async () => router.back());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RESUME_JOBS_POLL_INTERVAL_MS);
    });
    expect(await screen.findByRole("radio", { name: /ada-2026\.pdf/ })).toBeTruthy();
  });

  it("uploads another next to the parsed ones, and says when it couldn't be read", async () => {
    const failed = { ...QUEUED, status: "failed" as const, error_message: "Traceback: pdfminer" };
    const { jobs } = serveUploads([resumeJobRecord()], {
      "POST /resumes": (): FakeReply => {
        jobs.current = [failed, resumeJobRecord()];
        return { status: 201, data: QUEUED };
      },
    });
    await openResume();

    pick({ name: "ada-2026.pdf", mimeType: PDF, size: 2048 });
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.uploadAnother }));

    expect(await screen.findByText(MESSAGES.readFailed)).toBeTruthy();
    expect(screen.queryByText(/pdfminer/)).toBeNull();
    expect(screen.getByRole("radio", { name: /ada\.pdf/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /ada-2026\.pdf/ })).toBeNull();
  });

  it.each([
    ["an image", { name: "selfie.png", mimeType: "image/png", size: 2048 }, MESSAGES.badType],
    ["a file over 25 MB", { name: "huge.pdf", mimeType: PDF, size: RESUME_UPLOAD_MAX_BYTES + 1 }, MESSAGES.tooLarge],
    ["an empty file", { name: "blank.pdf", mimeType: PDF, size: 0 }, MESSAGES.emptyFile],
  ])("turns down %s on the phone, sending nothing", async (_what, asset, why) => {
    const { sent } = serveUploads([]);
    await openResume();

    pick(asset);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.uploadResume }));

    expect(await screen.findByText(why)).toBeTruthy();
    expect(uploadsSent(sent)).toEqual([]);
    expect(screen.getByRole("button", { name: MESSAGES.uploadResume })).toBeEnabled();
  });

  it.each([
    [429, RATE_LIMITED_MESSAGES.resumeUpload],
    [413, MESSAGES.tooLarge],
    [415, MESSAGES.badType],
    [500, MESSAGES.couldntUpload],
  ])("says why the server refused an upload with a %s, never in its words, and lets it be tried again", async (status, why) => {
    const { sent } = serveUploads([], { "POST /resumes": (): FakeReply => ({ status, data: { detail: "Traceback: boto3" } }) });
    await openResume();

    pick({ name: "ada.pdf", mimeType: PDF, size: 2048 });
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.uploadResume }));

    expect(await screen.findByText(why)).toBeTruthy();
    expect(screen.queryByText(/boto3/)).toBeNull();
    expect(await screen.findByRole("button", { name: MESSAGES.uploadResume })).toBeEnabled();
    expect(screen.getByText(MESSAGES.noResumeHeading)).toBeTruthy();

    pick({ name: "ada.pdf", mimeType: PDF, size: 2048 });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.uploadResume }));
    await waitFor(() => expect(uploadsSent(sent)).toHaveLength(2));
  });

  it("says so when the files couldn't be opened, and does nothing when the picker is closed", async () => {
    const { sent } = serveUploads([]);
    await openResume();

    jest.mocked(DocumentPicker.getDocumentAsync).mockRejectedValueOnce(new Error("no permission"));
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.uploadResume }));
    expect(await screen.findByText(MESSAGES.couldntPick)).toBeTruthy();

    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: true, assets: null });
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.uploadResume }));
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(2));
    expect(uploadsSent(sent)).toEqual([]);
  });
});
