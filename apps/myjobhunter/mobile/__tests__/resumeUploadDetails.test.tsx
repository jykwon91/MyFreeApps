import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
import { formatDateTime } from "@myjobhunter/api-client/utils/formatDateTime";
import { baseApi } from "@platform/core/store/baseApi";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Linking } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../src/constants/resume";
import { store } from "../src/lib/store";
import { refinementSessionRecord, resumeJobRecord } from "../test-support/refinementSessionRecord";
import { renderApp } from "../test-support/renderApp";
import { resumeRoutes } from "../test-support/resumeRoutes";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const UPLOADED_AT = "2026-10-20T12:00:00Z";
const PARSED = resumeJobRecord({
  id: "job-read",
  file_filename: "ada.pdf",
  file_size_bytes: 1536,
  created_at: UPLOADED_AT,
  result_parsed_fields: { headline: "Senior Software Engineer", summary: "Builds payment systems.", work_history_count: 1, education_count: 2, skills_count: 12 },
});
const FLAGGED = resumeJobRecord({
  ...PARSED,
  result_parsed_fields: {
    ...PARSED.result_parsed_fields!,
    provenance: { checked: true, flagged: [{ kind: "work_bullet", company: "Acme", text: "Grew revenue 300%", unsourced_terms: ["300%"] }] },
  },
});
const QUEUED = resumeJobRecord({ id: "job-queued", file_filename: "queued.pdf", file_size_bytes: null, status: "queued", result_parsed_fields: null });
const FAILED = resumeJobRecord({ id: "job-failed", file_filename: "broken.pdf", status: "failed", error_message: "no text", result_parsed_fields: null });

function serveUploads(jobs: readonly ResumeUploadJob[], routes: Record<string, FakeRoute> = {}) {
  return serve(resumeRoutes([], { current: refinementSessionRecord() }, {
    "GET /resume-upload-jobs": (): FakeReply => ({ status: 200, data: jobs }),
    ...routes,
  }));
}

async function openResume(): Promise<void> {
  await renderApp("/more");
  await fireEvent.press(await screen.findByRole("button", { name: "Resume" }));
  await screen.findByTestId("resume");
}

const downloadOf = (name: string) => screen.findByRole("button", { name: MESSAGES.downloadOriginalOf(name) });

beforeEach(() => {
  storedItems.clear();
  storeSession();
  openURL.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

describe("an upload's details on Resume", () => {
  it("shows when each upload came in and how big it is", async () => {
    serveUploads([PARSED, QUEUED]);
    await openResume();
    const row = await screen.findByTestId("resume-job-job-read");
    expect(within(row).getByText(`${formatDateTime(UPLOADED_AT)} · 1.5 KB`)).toBeTruthy();
    // An unknown size is left out rather than shown as nothing.
    const status = within(screen.getByLabelText(MESSAGES.uploadsLabel)).getByTestId("resume-upload-status");
    expect(within(status).getByText(formatDateTime(QUEUED.created_at))).toBeTruthy();
  });

  it("opens a read upload to what was read from it, and closes it again", async () => {
    serveUploads([PARSED]);
    await openResume();
    const toggle = await screen.findByRole("button", { name: MESSAGES.showParsed });
    expect(screen.queryByTestId("resume-parsed-panel")).toBeNull();

    await fireEvent.press(toggle);
    const panel = await screen.findByTestId("resume-parsed-panel");
    expect(within(panel).getByText("Senior Software Engineer")).toBeTruthy();
    expect(within(panel).getByText("Builds payment systems.")).toBeTruthy();
    expect(within(panel).getByText(/role$/)).toBeTruthy();
    expect(within(panel).getByText(/education entries$/)).toBeTruthy();
    expect(within(panel).getByText(/skills$/)).toBeTruthy();
    expect(within(panel).queryByTestId("resume-provenance-warning")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.hideParsed }));
    expect(screen.queryByTestId("resume-parsed-panel")).toBeNull();
  });

  it("warns about figures or names the parse found that aren't in the file", async () => {
    serveUploads([FLAGGED]);
    await openResume();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.showParsed }));
    const warning = await screen.findByTestId("resume-provenance-warning");
    expect(within(warning).getByText("1 item contains figures or names not found in your uploaded resume — review your Profile before refining.")).toBeTruthy();
    expect(within(warning).getByText("• 300% in Acme: “Grew revenue 300%”")).toBeTruthy();
  });

  it("downloads the original through a fresh signed link, showing it's opening from the press", async () => {
    let answer: () => void = () => undefined;
    const sent = serveUploads([PARSED], {
      "GET /resume-upload-jobs/job-read/download": () => new Promise<FakeReply>((resolve) => (answer = () => resolve({ status: 200, data: { url: "https://files.example.com/ada.pdf" } }))),
    });
    await openResume();
    await fireEvent.press(await downloadOf("ada.pdf"));

    expect(await screen.findByText(MESSAGES.openingOriginal)).toBeTruthy();
    await act(async () => answer());
    await waitFor(() => expect(openURL).toHaveBeenLastCalledWith("https://files.example.com/ada.pdf"));

    await fireEvent.press(await downloadOf("ada.pdf"));
    await act(async () => answer());
    // Never reused: the link expires.
    await waitFor(() => expect(sent.filter(({ route }) => route === "GET /resume-upload-jobs/job-read/download")).toHaveLength(2));
  });

  it("says so when the link can't be fetched, and never opens one that isn't a web address", async () => {
    let reply: FakeReply = { status: 500 };
    serveUploads([PARSED], { "GET /resume-upload-jobs/job-read/download": () => reply });
    await openResume();

    await fireEvent.press(await downloadOf("ada.pdf"));
    expect(await screen.findByText(MESSAGES.couldntDownloadOriginal)).toBeTruthy();

    reply = { status: 404 };
    await fireEvent.press(await downloadOf("ada.pdf"));
    expect(await screen.findByText(MESSAGES.uploadGone)).toBeTruthy();

    reply = { status: 200, data: { url: "javascript:alert(1)" } };
    await fireEvent.press(await downloadOf("ada.pdf"));
    expect(await screen.findByText(MESSAGES.unsafeDownload)).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("gives uploads that weren't read no parsed results, but keeps the original to download, as the website does", async () => {
    serveUploads([QUEUED, FAILED], { "GET /resume-upload-jobs/job-failed/download": (): FakeReply => ({ status: 200, data: { url: "https://files.example.com/broken.pdf" } }) });
    await openResume();
    expect(await downloadOf("queued.pdf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.showParsed })).toBeNull();

    await fireEvent.press(await downloadOf("broken.pdf"));
    await waitFor(() => expect(openURL).toHaveBeenLastCalledWith("https://files.example.com/broken.pdf"));
  });
});
