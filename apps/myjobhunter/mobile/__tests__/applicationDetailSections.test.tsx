import "@platform/mobile/test-support/reactNativeFormData";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { DOCUMENT_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/documentFieldLimits";
import { DOCUMENT_UPLOAD_MAX_BYTES } from "@myjobhunter/api-client/constants/documentUploadLimits";
import { INTERVIEW_LOCATION_MAX_LENGTH, INTERVIEWER_NAME_MAX_LENGTH, INTERVIEWERS_MAX } from "@myjobhunter/api-client/constants/interviewDetailLimits";
import { EVENT_NOTE_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import * as DocumentPicker from "expo-document-picker";
import { Alert, Linking } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as CONTACTS } from "../src/constants/applicationContacts";
import { APPLICATION_DOCUMENT_MESSAGES as DOCUMENTS } from "../src/constants/applicationDocuments";
import { interviewerNameTooLongMessage, tooManyInterviewersMessage } from "@myjobhunter/api-client/constants/interviewerProblems";
import { APPLICATION_EVENT_MESSAGES as EVENTS } from "../src/constants/applicationEvents";
import { formatDateTime } from "../src/lib/formatDateTime";
import { store } from "../src/lib/store";
import { alertButton } from "../test-support/alertButton";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationDetailRoutes } from "../test-support/applicationDetailRoutes";
import { contactRecord } from "../test-support/contactRecord";
import { documentRecord } from "../test-support/documentRecord";
import { eventRecord } from "../test-support/eventRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApplicationDetail } from "../test-support/renderApplicationDetail";
import { storeSession } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  const { mockRouter: router } = jest.requireActual<typeof import("../test-support/mockRouter")>("../test-support/mockRouter");
  return {
    router: { back: () => router.back(), push: (path: string) => router.push(path) },
    usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
      router.preventRemove.active = active;
      router.preventRemove.callback = callback;
      // Leaving the screen ends the guard, as the real hook does.
      useEffect(
        () => () => {
          router.preventRemove.active = false;
        },
        [],
      );
    },
  };
});

const ID = "app-stripe";
const INTERVIEW = eventRecord({
  id: "e-interview",
  application_id: ID,
  event_type: "interview_scheduled",
  occurred_at: "2026-10-22T16:00:00Z",
  interview_details: { type: "video", duration_minutes: 45, location_or_link: "https://meet.example.com/abc", interviewer_names: ["Ada", "Grace"] },
  note: "Bring questions about the team.",
});
const APPLIED = eventRecord({ id: "e-applied", application_id: ID, event_type: "applied", occurred_at: "2026-10-01T16:00:00Z", source: "gmail" });
const STRIPE = applicationDetailRecord({
  id: ID,
  role_title: "Staff Engineer",
  events: [INTERVIEW, APPLIED],
  contacts: [
    contactRecord({ id: "k-1", application_id: ID, name: "Sam Lee", role: "recruiter", email: "sam@stripe.com", linkedin_url: "https://linkedin.com/in/sam", notes: "Prefers email." }),
    contactRecord({ id: "k-2", application_id: ID }),
  ],
});
const LETTER = documentRecord({ id: "d-letter", application_id: ID, title: "Stripe cover letter" });
const RESUME = documentRecord({
  id: "d-resume",
  application_id: ID,
  title: "Tailored resume",
  kind: "tailored_resume",
  body: null,
  filename: "resume.pdf",
  content_type: "application/pdf",
  size_bytes: 20480,
  has_file: true,
});

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

const created = (body: Record<string, unknown>): FakeReply => ({ status: 201, data: eventRecord({ id: "e-new", application_id: ID, event_type: "applied", ...body }) });

describe("the activity timeline", () => {
  it("shows a skeleton while it loads, then each event newest first with its details, note and source", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serve({ ...applicationDetailRoutes(STRIPE), [`GET /applications/${ID}/events`]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await renderApplicationDetail(ID);

    expect(await screen.findByTestId("events-skeleton")).toBeTruthy();
    await act(async () => answer({ status: 200, data: { items: [INTERVIEW, APPLIED], total: 2 } }));

    const interview = await screen.findByTestId("event-e-interview");
    expect(within(interview).getByText("Interview scheduled")).toBeTruthy();
    expect(within(interview).getByText("Video")).toBeTruthy();
    expect(within(interview).getByText(`45 ${EVENTS.minutes}`)).toBeTruthy();
    expect(within(interview).getByText("Ada, Grace")).toBeTruthy();
    expect(within(interview).getByText("Bring questions about the team.")).toBeTruthy();
    expect(within(screen.getByTestId("event-e-applied")).getByText(`${EVENTS.via} gmail`)).toBeTruthy();
    // Only interviews have details to edit.
    expect(within(screen.getByTestId("event-e-applied")).queryByRole("button", { name: new RegExp(`^${EVENTS.edit}`) })).toBeNull();
  });

  it("says when there's nothing on the timeline yet", async () => {
    serve(applicationDetailRoutes(STRIPE, { events: [] }));
    await renderApplicationDetail(ID);
    expect(await screen.findByText(EVENTS.none)).toBeTruthy();
  });

  it("offers to try again when the timeline won't load", async () => {
    let fails = true;
    serve({
      ...applicationDetailRoutes(STRIPE),
      [`GET /applications/${ID}/events`]: () => (fails ? { status: 500 } : { status: 200, data: { items: [APPLIED], total: 1 } }),
    });
    await renderApplicationDetail(ID);

    expect(await screen.findByText(EVENTS.couldntLoad)).toBeTruthy();
    fails = false;
    await fireEvent.press(screen.getByRole("button", { name: EVENTS.tryAgain }));
    expect(await screen.findByTestId("event-e-applied")).toBeTruthy();
  });

  it("logs an interview with its details, after asking for the interview type", async () => {
    const sent = serve({ ...applicationDetailRoutes(STRIPE), [`POST /applications/${ID}/events`]: created });
    await renderApplicationDetail(ID);
    await fireEvent.press(await screen.findByRole("button", { name: EVENTS.logEvent }));

    // Opens on now, so When needs no choosing.
    await fireEvent.press(screen.getByRole("radio", { name: "Interview scheduled" }));
    await fireEvent.changeText(screen.getByLabelText(EVENTS.durationLabel), "60");
    await fireEvent.changeText(screen.getByLabelText(EVENTS.locationLabel), "  https://zoom.example.com/1  ");
    await fireEvent.changeText(screen.getByLabelText(EVENTS.interviewersLabel), "Ada\n\n Grace ");
    await fireEvent.changeText(screen.getByLabelText(EVENTS.noteLabel), " First round ");
    const submit = () => screen.getAllByRole("button", { name: EVENTS.logEvent }).at(-1)!;
    await fireEvent.press(submit());

    expect(await screen.findByText(EVENTS.typeRequired)).toBeTruthy();
    expect(sent.some(({ route }) => route === `POST /applications/${ID}/events`)).toBe(false);

    await fireEvent.press(screen.getByRole("radio", { name: "Phone" }));
    await fireEvent.press(submit());

    expect(await screen.findByText(EVENTS.logged)).toBeTruthy();
    const [body] = sent.filter(({ route }) => route === `POST /applications/${ID}/events`).map((request) => request.body);
    expect(body).toEqual({
      event_type: "interview_scheduled",
      occurred_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/),
      source: "manual",
      note: "First round",
      interview_details: { type: "phone", duration_minutes: 60, location_or_link: "https://zoom.example.com/1", interviewer_names: ["Ada", "Grace"] },
    });
    expect(screen.queryByLabelText(EVENTS.durationLabel)).toBeNull();
  });

  it("sends no interview details for other events, and checks the duration's range", async () => {
    const sent = serve({ ...applicationDetailRoutes(STRIPE), [`POST /applications/${ID}/events`]: created });
    await renderApplicationDetail(ID);
    await fireEvent.press(await screen.findByRole("button", { name: EVENTS.logEvent }));
    await fireEvent.press(screen.getByRole("radio", { name: "Interview completed" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Video" }));
    await fireEvent.changeText(screen.getByLabelText(EVENTS.durationLabel), "2000");
    await fireEvent.press(screen.getAllByRole("button", { name: EVENTS.logEvent }).at(-1)!);
    expect(await screen.findByText("Between 1 and 1440.")).toBeTruthy();

    // The backend takes up to 20 interviewers of up to 200 characters each.
    await fireEvent.changeText(screen.getByLabelText(EVENTS.interviewersLabel), Array.from({ length: 21 }, (_, i) => `Person ${i}`).join("\n"));
    await fireEvent.press(screen.getAllByRole("button", { name: EVENTS.logEvent }).at(-1)!);
    expect(await screen.findByText(tooManyInterviewersMessage(INTERVIEWERS_MAX))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(EVENTS.interviewersLabel), "x".repeat(INTERVIEWER_NAME_MAX_LENGTH + 1));
    await fireEvent.press(screen.getAllByRole("button", { name: EVENTS.logEvent }).at(-1)!);
    expect(await screen.findByText(interviewerNameTooLongMessage(INTERVIEWER_NAME_MAX_LENGTH))).toBeTruthy();
    expect(screen.getByLabelText(EVENTS.noteLabel).props.maxLength).toBeUndefined();
    expect(sent.some(({ route }) => route === `POST /applications/${ID}/events`)).toBe(false);

    // A note or location over the limit is kept whole, named, and blocks the save.
    await fireEvent.changeText(screen.getByLabelText(EVENTS.interviewersLabel), "Sam");
    const tooLongNote = "😀".repeat(EVENT_NOTE_MAX_LENGTH + 1);
    await fireEvent.changeText(screen.getByLabelText(EVENTS.noteLabel), tooLongNote);
    await fireEvent.changeText(screen.getByLabelText(EVENTS.locationLabel), "x".repeat(INTERVIEW_LOCATION_MAX_LENGTH + 1));
    await fireEvent.press(screen.getAllByRole("button", { name: EVENTS.logEvent }).at(-1)!);
    expect(await screen.findByText("Keep this to 5,000 characters or fewer.")).toBeTruthy();
    expect(screen.getByText("Keep this to 1,024 characters or fewer.")).toBeTruthy();
    expect(screen.getByLabelText(EVENTS.noteLabel).props.value).toBe(tooLongNote);
    expect(sent.some(({ route }) => route === `POST /applications/${ID}/events`)).toBe(false);
    await fireEvent.changeText(screen.getByLabelText(EVENTS.noteLabel), "");
    await fireEvent.changeText(screen.getByLabelText(EVENTS.locationLabel), "");

    await fireEvent.press(screen.getByRole("radio", { name: "Follow-up sent" }));
    expect(screen.queryByLabelText(EVENTS.durationLabel)).toBeNull();
    await fireEvent.press(screen.getAllByRole("button", { name: EVENTS.logEvent }).at(-1)!);

    expect(await screen.findByText(EVENTS.logged)).toBeTruthy();
    expect(sent.filter(({ route }) => route === `POST /applications/${ID}/events`).map(({ body }) => [body.event_type, body.interview_details, body.note])).toEqual([
      ["follow_up_sent", null, null],
    ]);
  });

  it("keeps the sheet open and says so when logging fails", async () => {
    serve({ ...applicationDetailRoutes(STRIPE), [`POST /applications/${ID}/events`]: () => ({ status: 500 }) });
    await renderApplicationDetail(ID);
    await fireEvent.press(await screen.findByRole("button", { name: EVENTS.logEvent }));
    await fireEvent.press(screen.getAllByRole("button", { name: EVENTS.logEvent }).at(-1)!);

    expect(await screen.findByText(EVENTS.couldntLog)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Applied" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: EVENTS.cancel }));
    expect(screen.queryByRole("radio", { name: "Applied" })).toBeNull();
  });

  it("edits an interview's details, starting from what it has", async () => {
    const sent = serve({ ...applicationDetailRoutes(STRIPE), [`PATCH /applications/${ID}/events/e-interview`]: () => ({ status: 200, data: INTERVIEW }) });
    await renderApplicationDetail(ID);
    // The button names the event it edits, so a screen reader can tell several apart.
    const editLabel = `${EVENTS.edit}: ${formatEventType(INTERVIEW.event_type)}, ${formatDateTime(INTERVIEW.occurred_at)}`;
    await fireEvent.press(within(await screen.findByTestId("event-e-interview")).getByRole("button", { name: editLabel }));

    expect(screen.getByDisplayValue("45")).toBeTruthy();
    expect(screen.getByDisplayValue("https://meet.example.com/abc")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(EVENTS.durationLabel), "90");
    await fireEvent.press(screen.getByRole("button", { name: EVENTS.saveChanges }));

    expect(await screen.findByText(EVENTS.updated)).toBeTruthy();
    expect(sent.filter(({ route }) => route === `PATCH /applications/${ID}/events/e-interview`).map(({ body }) => body)).toEqual([
      {
        interview_details: { type: "video", duration_minutes: 90, location_or_link: "https://meet.example.com/abc", interviewer_names: ["Ada", "Grace"] },
        note: "Bring questions about the team.",
      },
    ]);
  });
});

describe("the documents", () => {
  it("shows a skeleton while they load, then each one", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serve({ ...applicationDetailRoutes(STRIPE), "GET /documents": () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await renderApplicationDetail(ID);

    expect(await screen.findByTestId("documents-skeleton")).toBeTruthy();
    await act(async () => answer({ status: 200, data: { items: [LETTER, RESUME], total: 2 } }));

    expect(within(await screen.findByTestId("document-d-letter")).getByText("Stripe cover letter")).toBeTruthy();
    expect(within(screen.getByTestId("document-d-resume")).getByText(DOCUMENTS.file)).toBeTruthy();
    expect(sent.find(({ route }) => route === "GET /documents")?.params).toEqual({ application_id: ID });
    // Everything happens on the phone now, uploads included.
    expect(openURL).not.toHaveBeenCalled();
  });

  it("says when there are none", async () => {
    serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);
    expect(await screen.findByText(DOCUMENTS.none)).toBeTruthy();
  });

  it("offers to try again when they won't load", async () => {
    serve({ ...applicationDetailRoutes(STRIPE), "GET /documents": () => ({ status: 500 }) });
    await renderApplicationDetail(ID);
    expect(await screen.findByText(DOCUMENTS.couldntLoad)).toBeTruthy();
    expect(screen.getByRole("button", { name: DOCUMENTS.tryAgain })).toBeTruthy();
  });

  it("opens a file through a fresh download link", async () => {
    serve({ ...applicationDetailRoutes(STRIPE, { documents: [RESUME] }), "GET /documents/d-resume/download": () => ({ status: 200, data: { url: "https://files.example.com/resume.pdf" } }) });
    await renderApplicationDetail(ID);
    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.open} Tailored resume` }));
    expect(openURL).toHaveBeenLastCalledWith("https://files.example.com/resume.pdf");
  });

  it("writes a text document for this application, after asking for its title and content", async () => {
    const sent = serve({ ...applicationDetailRoutes(STRIPE), "POST /documents": () => ({ status: 201, data: LETTER }) });
    await renderApplicationDetail(ID);
    await fireEvent.press(await screen.findByRole("button", { name: DOCUMENTS.add }));
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.create }));

    expect(await screen.findByText(DOCUMENTS.titleRequired)).toBeTruthy();
    expect(screen.getByText(DOCUMENTS.contentRequired)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`), "Thank-you note");
    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.contentLabel}, required`), "Thanks for your time.");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.create }));

    expect(await screen.findByText(DOCUMENTS.created)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "POST /documents").map(({ body }) => body)).toEqual([
      { title: "Thank-you note", kind: "cover_letter", application_id: ID, body: "Thanks for your time." },
    ]);
  });

  it("edits only what changed on a document, and can't replace a file's content", async () => {
    const sent = serve({ ...applicationDetailRoutes(STRIPE, { documents: [RESUME] }), "PATCH /documents/d-resume": () => ({ status: 200, data: RESUME }) });
    await renderApplicationDetail(ID);
    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.edit} Tailored resume` }));

    expect(screen.getByText(`resume.pdf — ${DOCUMENTS.fileContent}`)).toBeTruthy();
    expect(screen.queryByLabelText(DOCUMENTS.contentLabel)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`), "Resume for Stripe");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.saveChanges }));

    expect(await screen.findByText(DOCUMENTS.updated)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "PATCH /documents/d-resume").map(({ body }) => body)).toEqual([{ title: "Resume for Stripe" }]);
  });

  it("deletes a document after asking", async () => {
    const sent = serve({ ...applicationDetailRoutes(STRIPE, { documents: [LETTER] }), "DELETE /documents/d-letter": () => ({ status: 204 }) });
    await renderApplicationDetail(ID);
    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.delete} Stripe cover letter` }));

    expect(alert).toHaveBeenCalledWith(DOCUMENTS.deleteTitle, `"Stripe cover letter" — ${DOCUMENTS.deleteBody}`, expect.any(Array));
    await act(async () => alertButton(DOCUMENTS.delete).onPress?.());

    expect(await screen.findByText(DOCUMENTS.deleted)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "DELETE /documents/d-letter")).toHaveLength(1);
  });
});

describe("uploading a file", () => {
  const PDF = "application/pdf";

  function pick(asset: Partial<DocumentPicker.DocumentPickerAsset> & Pick<DocumentPicker.DocumentPickerAsset, "name">): void {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: `file:///cache/${asset.name}`, lastModified: 0, ...asset }],
    });
  }

  async function openUpload(): Promise<void> {
    await fireEvent.press(await screen.findByRole("button", { name: DOCUMENTS.upload }));
  }

  it("uploads a picked file with its title and type for this application, then says so", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serve({ ...applicationDetailRoutes(STRIPE), "POST /documents/upload": () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await renderApplicationDetail(ID);
    await openUpload();

    // Only the website's types are offered.
    pick({ name: "resume.pdf", mimeType: PDF, size: 20480 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
      copyToCacheDirectory: true,
    });
    expect(await screen.findByText("resume.pdf (20.0 KB)")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`), " Resume for Stripe ");
    await fireEvent.press(screen.getByRole("radio", { name: "Tailored Resume" }));
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit }));

    // Busy from the moment it's pressed, so it can't be sent twice, and Cancel waits it out.
    const busy = await screen.findByRole("button", { name: DOCUMENTS.uploading });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("button", { name: DOCUMENTS.cancel })).toBeDisabled();
    await act(async () => answer({ status: 201, data: RESUME }));

    expect(await screen.findByText(DOCUMENTS.uploaded)).toBeTruthy();
    expect(screen.queryByRole("button", { name: DOCUMENTS.uploadSubmit })).toBeNull();
    const [request] = sent.filter(({ route }) => route === "POST /documents/upload");
    const form = request.data as FormData;
    expect(["title", "kind", "application_id"].map((name) => form.getAll(name))).toEqual([["Resume for Stripe"], ["tailored_resume"], [ID]]);
    expect(form.getAll("file")).toEqual([{ uri: "file:///cache/resume.pdf", name: "resume.pdf", type: PDF }]);
  });

  it("keeps the sheet as it was when the person backs out of the picker", async () => {
    const sent = serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);
    await openUpload();
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: true, assets: null });

    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));

    expect(await screen.findByRole("button", { name: DOCUMENTS.chooseFile })).toBeEnabled();
    expect(screen.queryByTestId("upload-file")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(sent.some(({ route }) => route === "POST /documents/upload")).toBe(false);
  });

  it("holds Upload and Cancel while the picker is open, and doesn't cut the title short, but says when it's too long and won't upload", async () => {
    let finish: (result: DocumentPicker.DocumentPickerResult) => void = () => undefined;
    serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);
    await openUpload();
    const title = screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`);
    expect(title.props.maxLength).toBeUndefined();
    const tooLong = "😀".repeat(DOCUMENT_TITLE_MAX_LENGTH + 1);
    await fireEvent.changeText(title, tooLong);
    expect(await screen.findByText("Keep this to 255 characters or fewer.")).toBeTruthy();
    expect(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`).props.value).toBe(tooLong);
    await fireEvent.changeText(title, "😀".repeat(DOCUMENT_TITLE_MAX_LENGTH));
    expect(screen.queryByText(/Keep this to/)).toBeNull();
    jest.mocked(DocumentPicker.getDocumentAsync).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));

    expect(await screen.findByRole("button", { name: DOCUMENTS.choosing })).toBeDisabled();
    expect(screen.getByRole("button", { name: DOCUMENTS.cancel })).toBeDisabled();
    expect(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit })).toBeDisabled();
    await act(async () => finish({ canceled: true, assets: null }));
    expect(screen.getByRole("button", { name: DOCUMENTS.cancel })).toBeEnabled();
  });

  it("asks for a file and a title before uploading", async () => {
    const sent = serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);
    await openUpload();
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit }));

    expect(await screen.findByText(DOCUMENTS.fileRequired)).toBeTruthy();
    expect(screen.getByText(DOCUMENTS.titleRequired)).toBeTruthy();
    expect(sent.some(({ route }) => route === "POST /documents/upload")).toBe(false);
  });

  it("refuses a file over 25 MB before sending it", async () => {
    const sent = serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);
    await openUpload();
    pick({ name: "huge.pdf", mimeType: PDF, size: DOCUMENT_UPLOAD_MAX_BYTES + 1 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));

    expect(await screen.findByText(DOCUMENTS.tooLarge)).toBeTruthy();
    expect(screen.queryByTestId("upload-file")).toBeNull();
    expect(sent.some(({ route }) => route === "POST /documents/upload")).toBe(false);
  });

  it("refuses an empty file before sending it", async () => {
    const sent = serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);
    await openUpload();
    pick({ name: "blank.pdf", mimeType: PDF, size: 0 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));

    expect(await screen.findByText(DOCUMENTS.emptyFile)).toBeTruthy();
    expect(screen.queryByTestId("upload-file")).toBeNull();
    expect(sent.some(({ route }) => route === "POST /documents/upload")).toBe(false);
  });

  it("refuses a file of another type, reading it from the name when the picker doesn't say", async () => {
    serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);
    await openUpload();
    pick({ name: "photo.png", mimeType: "application/octet-stream", size: 100 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));

    expect(await screen.findByText(DOCUMENTS.badType)).toBeTruthy();
    expect(screen.queryByTestId("upload-file")).toBeNull();

    // A Word file named for what it is goes through, even unlabelled.
    pick({ name: "letter.docx", mimeType: "application/octet-stream", size: 100 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));
    expect(await screen.findByText("letter.docx (100 B)")).toBeTruthy();
    expect(screen.queryByText(DOCUMENTS.badType)).toBeNull();
  });

  it("keeps the sheet open with the chosen file and says so when the upload fails", async () => {
    serve({ ...applicationDetailRoutes(STRIPE), "POST /documents/upload": () => ({ status: 500 }) });
    await renderApplicationDetail(ID);
    await openUpload();
    pick({ name: "resume.pdf", mimeType: PDF, size: 2048 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));
    await fireEvent.changeText(await screen.findByLabelText(`${DOCUMENTS.titleLabel}, required`), "Resume");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit }));

    expect(await screen.findByText(DOCUMENTS.couldntUpload)).toBeTruthy();
    expect(screen.getByText("resume.pdf (2.0 KB)")).toBeTruthy();
    expect(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit })).toBeEnabled();
  });

  it("says the file is too large when the server refuses it for its size", async () => {
    serve({ ...applicationDetailRoutes(STRIPE), "POST /documents/upload": () => ({ status: 413, data: { detail: "File exceeds the limit" } }) });
    await renderApplicationDetail(ID);
    await openUpload();
    // The picker didn't know the size, so only the server can tell.
    pick({ name: "resume.pdf", mimeType: PDF });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));
    await fireEvent.changeText(await screen.findByLabelText(`${DOCUMENTS.titleLabel}, required`), "Resume");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit }));

    expect(await screen.findByText(DOCUMENTS.tooLarge)).toBeTruthy();
  });

  it("says the file is empty when the server refuses it as empty", async () => {
    serve({ ...applicationDetailRoutes(STRIPE), "POST /documents/upload": () => ({ status: 415, data: { detail: "empty file" } }) });
    await renderApplicationDetail(ID);
    await openUpload();
    // The picker didn't know the size, so only the server can tell.
    pick({ name: "resume.pdf", mimeType: PDF });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));
    await fireEvent.changeText(await screen.findByLabelText(`${DOCUMENTS.titleLabel}, required`), "Resume");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit }));

    expect(await screen.findByText(DOCUMENTS.emptyFile)).toBeTruthy();
    expect(screen.queryByText(DOCUMENTS.badType)).toBeNull();
  });
});

describe("the contacts", () => {
  it("shows each person with their role, a way to reach them and notes", async () => {
    serve(applicationDetailRoutes(STRIPE));
    await renderApplicationDetail(ID);

    const sam = await screen.findByTestId("contact-k-1");
    expect(within(sam).getByText("Sam Lee")).toBeTruthy();
    expect(within(sam).getByText("Recruiter")).toBeTruthy();
    expect(within(sam).getByText("Prefers email.")).toBeTruthy();
    expect(within(screen.getByTestId("contact-k-2")).getByText(CONTACTS.unnamed)).toBeTruthy();

    await fireEvent.press(within(sam).getByRole("link", { name: "sam@stripe.com" }));
    expect(openURL).toHaveBeenLastCalledWith("mailto:sam@stripe.com");
    await fireEvent.press(within(sam).getByRole("link", { name: CONTACTS.linkedIn }));
    expect(openURL).toHaveBeenLastCalledWith("https://linkedin.com/in/sam");
  });

  it("shows a contact's email or profile as plain text when it isn't safe to open", async () => {
    const odd = contactRecord({ id: "k-odd", application_id: ID, name: "Eve", email: "javascript:alert(1)", linkedin_url: "intent://evil" });
    serve(applicationDetailRoutes({ ...STRIPE, contacts: [odd] }));
    await renderApplicationDetail(ID);

    const eve = await screen.findByTestId("contact-k-odd");
    expect(within(eve).queryAllByRole("link")).toHaveLength(0);
    expect(within(eve).getByText("javascript:alert(1)")).toBeTruthy();
    expect(within(eve).getByText("intent://evil")).toBeTruthy();
  });

  it("says when there are none", async () => {
    serve(applicationDetailRoutes({ ...STRIPE, contacts: [] }));
    await renderApplicationDetail(ID);
    expect(await screen.findByText(CONTACTS.none)).toBeTruthy();
  });
});
