import { APPLICATION_NOTES_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../src/constants/applicationDetail";
import { APPLICATION_NOTES_MESSAGES as NOTES } from "../src/constants/applicationNotes";
import { store } from "../src/lib/store";
import { alertButton } from "../test-support/alertButton";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationDetailRoutes } from "../test-support/applicationDetailRoutes";
import { eventRecord } from "../test-support/eventRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { mockRouter } from "../test-support/mockRouter";
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
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "move-key-1") }));
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
const STRIPE = applicationDetailRecord({
  id: ID,
  role_title: "Staff Engineer",
  url: "https://stripe.com/jobs/1",
  jd_text: "Build payments infrastructure.",
  location: "Seattle, WA",
  remote_type: "hybrid",
  fit_score: "85",
  source: "LinkedIn",
  posted_salary_min: "180000",
  posted_salary_max: "220000",
  posted_salary_period: "annual",
  notes: "Recruiter is Sam.",
  events: [eventRecord({ id: "e-1", application_id: ID, event_type: "interview_scheduled" })],
});

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

it("shows a skeleton of the whole screen while the application loads, then its header, actions and overview", async () => {
  let answer: (reply: FakeReply) => void = () => undefined;
  serve({
    ...applicationDetailRoutes(STRIPE),
    [`GET /applications/${ID}`]: () => new Promise<FakeReply>((resolve) => (answer = resolve)),
  });
  await renderApplicationDetail(ID);

  expect(await screen.findByTestId("application-detail-skeleton")).toBeTruthy();
  expect(screen.getByLabelText(MESSAGES.loading)).toBeTruthy();
  // Room for the buttons each list section shows under its heading: Log event; Write and Upload.
  expect(within(screen.getByTestId("skeleton-section-activity")).getAllByTestId("skeleton-section-button", { includeHiddenElements: true })).toHaveLength(1);
  expect(within(screen.getByTestId("skeleton-section-documents")).getAllByTestId("skeleton-section-button", { includeHiddenElements: true })).toHaveLength(2);
  expect(within(screen.getByTestId("skeleton-section-contacts")).queryAllByTestId("skeleton-section-button", { includeHiddenElements: true })).toHaveLength(0);

  await act(async () => answer({ status: 200, data: STRIPE }));

  expect(await screen.findByRole("header", { name: "Staff Engineer" })).toBeTruthy();
  expect(screen.queryByTestId("application-detail-skeleton")).toBeNull();
  expect(await screen.findByText("Stripe")).toBeTruthy();
  // Its newest stage-defining event puts it in Interviewing, as on the board.
  expect(screen.getAllByText("Interviewing").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Hybrid")).toHaveLength(2);
  expect(screen.getByText("85%")).toBeTruthy();
  expect(screen.getByText("Seattle, WA")).toBeTruthy();
  expect(screen.getByText("LinkedIn")).toBeTruthy();
  expect(screen.getByText("Build payments infrastructure.")).toBeTruthy();
  expect(screen.getByRole("button", { name: MESSAGES.archive })).toBeTruthy();
  expect(screen.getByRole("button", { name: MESSAGES.delete })).toBeTruthy();

  await fireEvent.press(screen.getByRole("link", { name: "https://stripe.com/jobs/1" }));
  expect(openURL).toHaveBeenLastCalledWith("https://stripe.com/jobs/1");
});

it("offers to try again when the application won't load, and shows it once it does", async () => {
  let fails = true;
  serve({
    ...applicationDetailRoutes(STRIPE),
    [`GET /applications/${ID}`]: () => (fails ? { status: 500 } : { status: 200, data: STRIPE }),
  });
  await renderApplicationDetail(ID);

  expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
  fails = false;
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));

  expect(await screen.findByRole("header", { name: "Staff Engineer" })).toBeTruthy();
});

it("says when the application is gone, with a way back to the list", async () => {
  serve({ ...applicationDetailRoutes(STRIPE), [`GET /applications/${ID}`]: () => ({ status: 404, data: { detail: "Not Found" } }) });
  await renderApplicationDetail(ID);

  expect(await screen.findByText(MESSAGES.cantFind)).toBeTruthy();
  expect(screen.getByText(MESSAGES.maybeDeleted)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.back }));

  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

it("keeps what it loaded on screen under a banner when a refresh fails", async () => {
  let fails = false;
  serve({
    ...applicationDetailRoutes(STRIPE),
    [`GET /applications/${ID}`]: () => (fails ? { status: 500 } : { status: 200, data: STRIPE }),
  });
  await renderApplicationDetail(ID);
  await screen.findByRole("header", { name: "Staff Engineer" });

  fails = true;
  await act(async () => {
    await screen.getByTestId("application-detail").props.refreshControl.props.onRefresh();
  });

  expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
  expect(screen.getByRole("header", { name: "Staff Engineer" })).toBeTruthy();
});

it("saves edited notes when Save is pressed, and says so", async () => {
  const sent = serve({ ...applicationDetailRoutes(STRIPE), [`PATCH /applications/${ID}`]: () => ({ status: 200, data: STRIPE }) });
  await renderApplicationDetail(ID);
  const field = await screen.findByDisplayValue("Recruiter is Sam.");
  const save = screen.getByRole("button", { name: NOTES.save });
  expect(field.props.maxLength).toBeUndefined();

  // Nothing to save until something changes.
  expect(save).toBeDisabled();
  await fireEvent.changeText(field, "Recruiter is Sam. Onsite next week.");
  expect(save).toBeEnabled();
  await fireEvent.press(save);

  expect(await screen.findByText(NOTES.saved)).toBeTruthy();
  expect(sent.filter(({ route }) => route === `PATCH /applications/${ID}`).map(({ body }) => body)).toEqual([
    { notes: "Recruiter is Sam. Onsite next week." },
  ]);
  expect(screen.getByRole("button", { name: NOTES.save })).toBeDisabled();
});

it("says when notes are too long, keeps all of them and won't save", async () => {
  const sent = serve({ ...applicationDetailRoutes(STRIPE), [`PATCH /applications/${ID}`]: () => ({ status: 200, data: STRIPE }) });
  await renderApplicationDetail(ID);
  const field = await screen.findByDisplayValue("Recruiter is Sam.");
  // 😀 is one character to the backend but two to JavaScript: this many fit, one more doesn't.
  const fits = "😀".repeat(APPLICATION_NOTES_MAX_LENGTH);
  const tooLong = `${fits}😀`;

  await fireEvent.changeText(field, fits);
  expect(screen.queryByText(/Keep this to/)).toBeNull();
  expect(screen.getByRole("button", { name: NOTES.save })).toBeEnabled();

  await fireEvent.changeText(field, tooLong);
  expect(await screen.findByText("Keep this to 5,000 characters or fewer.")).toBeTruthy();
  expect(screen.getByDisplayValue(tooLong)).toBeTruthy();
  expect(screen.getByText("5,001 / 5,000", { includeHiddenElements: true })).toBeTruthy();

  // Over by more: the alert reads the same (so it isn't announced again) and only the counter moves.
  await fireEvent.changeText(field, `${tooLong}😀`);
  expect(await screen.findByText("5,002 / 5,000", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getAllByRole("alert").map((alert) => alert.props.children)).toEqual(["Keep this to 5,000 characters or fewer."]);
  expect(screen.getByRole("button", { name: NOTES.save })).toBeDisabled();
  expect(sent.some(({ route }) => route === `PATCH /applications/${ID}`)).toBe(false);
});

it("keeps the typed notes and says so when saving them fails", async () => {
  serve({ ...applicationDetailRoutes(STRIPE), [`PATCH /applications/${ID}`]: () => ({ status: 500 }) });
  await renderApplicationDetail(ID);
  await fireEvent.changeText(await screen.findByDisplayValue("Recruiter is Sam."), "New notes");
  await fireEvent.press(screen.getByRole("button", { name: NOTES.save }));

  expect(await screen.findByText(NOTES.couldntSave)).toBeTruthy();
  expect(screen.getByDisplayValue("New notes")).toBeTruthy();
  expect(screen.getByRole("button", { name: NOTES.save })).toBeEnabled();
});

it("asks before leaving with unsaved notes, and lets the person discard them", async () => {
  serve(applicationDetailRoutes(STRIPE));
  await renderApplicationDetail(ID);
  const field = await screen.findByDisplayValue("Recruiter is Sam.");
  expect(mockRouter.preventRemove.active).toBe(false);

  await fireEvent.changeText(field, "Unsaved");
  expect(mockRouter.preventRemove.active).toBe(true);
  const repeat = jest.fn();
  await act(async () => mockRouter.preventRemove.callback?.({ repeat }));

  expect(alert).toHaveBeenCalledWith(NOTES.leaveTitle, NOTES.leaveBody, expect.any(Array));
  await act(async () => alertButton(NOTES.discard).onPress?.());
  expect(repeat).toHaveBeenCalledTimes(1);
});

it("saves unsaved notes before leaving when the person chooses Save", async () => {
  const sent = serve({ ...applicationDetailRoutes(STRIPE), [`PATCH /applications/${ID}`]: () => ({ status: 200, data: STRIPE }) });
  await renderApplicationDetail(ID);
  await fireEvent.changeText(await screen.findByDisplayValue("Recruiter is Sam."), "Saved on the way out");
  const repeat = jest.fn();
  await act(async () => mockRouter.preventRemove.callback?.({ repeat }));
  await act(async () => alertButton(NOTES.save).onPress?.());

  expect(sent.filter(({ route }) => route === `PATCH /applications/${ID}`).map(({ body }) => body)).toEqual([{ notes: "Saved on the way out" }]);
  expect(repeat).toHaveBeenCalledTimes(1);
});

it("moves the application to another stage from the stage picker", async () => {
  const sent = serve({
    ...applicationDetailRoutes(STRIPE),
    [`POST /applications/${ID}/transitions`]: () => ({ status: 201, data: eventRecord({ id: "e-2", application_id: ID, event_type: "offer_received" }) }),
  });
  await renderApplicationDetail(ID);
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${MESSAGES.stage}`) }));
  await fireEvent.press(await screen.findByRole("radio", { name: "Offer" }));

  expect(await screen.findByText("Moved to Offer.")).toBeTruthy();
  expect(sent.filter(({ route }) => route === `POST /applications/${ID}/transitions`).map(({ body }) => body)).toEqual([
    // A fresh key per move, as the website's board sends.
    { target_column: "offer", idempotency_key: "move-key-1" },
  ]);
});

it("archives the application", async () => {
  const sent = serve({ ...applicationDetailRoutes(STRIPE), [`PATCH /applications/${ID}`]: () => ({ status: 200, data: STRIPE }) });
  await renderApplicationDetail(ID);
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.archive }));

  expect(await screen.findByText(MESSAGES.archivedToast)).toBeTruthy();
  expect(sent.filter(({ route }) => route === `PATCH /applications/${ID}`).map(({ body }) => body)).toEqual([{ archived: true }]);
});

it("restores an archived application", async () => {
  const archived = { ...STRIPE, archived: true };
  const sent = serve({ ...applicationDetailRoutes(archived), [`PATCH /applications/${ID}`]: () => ({ status: 200, data: STRIPE }) });
  await renderApplicationDetail(ID);

  expect(await screen.findByText(MESSAGES.archived)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.restore }));

  expect(await screen.findByText(MESSAGES.restoredToast)).toBeTruthy();
  expect(sent.filter(({ route }) => route === `PATCH /applications/${ID}`).map(({ body }) => body)).toEqual([{ archived: false }]);
});

it("deletes the application after asking, then goes back to the list", async () => {
  const sent = serve({ ...applicationDetailRoutes(STRIPE), [`DELETE /applications/${ID}`]: () => ({ status: 204 }) });
  await renderApplicationDetail(ID);
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.delete }));

  expect(alert).toHaveBeenCalledWith(MESSAGES.deleteTitle, MESSAGES.deleteBody, expect.any(Array));
  // Keeping it sends nothing.
  await act(async () => alertButton(MESSAGES.keep).onPress?.());
  expect(sent.some(({ route }) => route.startsWith("DELETE"))).toBe(false);

  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.delete }));
  await act(async () => alertButton(MESSAGES.delete).onPress?.());

  expect(await screen.findByText(MESSAGES.deleted)).toBeTruthy();
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(sent.filter(({ route }) => route === `DELETE /applications/${ID}`)).toHaveLength(1);
});

it("goes straight back after a delete, even with unsaved notes, without asking about them", async () => {
  serve({ ...applicationDetailRoutes(STRIPE), [`DELETE /applications/${ID}`]: () => ({ status: 204 }) });
  await renderApplicationDetail(ID);
  await fireEvent.changeText(await screen.findByDisplayValue("Recruiter is Sam."), "Unsaved");
  expect(mockRouter.preventRemove.active).toBe(true);

  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.delete }));
  await act(async () => alertButton(MESSAGES.delete).onPress?.());

  expect(await screen.findByText(MESSAGES.deleted)).toBeTruthy();
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  // The notes went with the application, so the guard stood down rather than asking.
  expect(mockRouter.preventRemove.active).toBe(false);
  expect(alert).not.toHaveBeenCalledWith(NOTES.leaveTitle, expect.anything(), expect.anything());
  // Nothing more to press while the screen goes, but no button is stuck spinning either.
  expect(screen.getByRole("button", { name: MESSAGES.delete })).toBeDisabled();
  expect(screen.queryByRole("button", { name: MESSAGES.deleting })).toBeNull();
});

it("stays on the application and says so when deleting fails", async () => {
  serve({ ...applicationDetailRoutes(STRIPE), [`DELETE /applications/${ID}`]: () => ({ status: 500 }) });
  await renderApplicationDetail(ID);
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.delete }));
  await act(async () => alertButton(MESSAGES.delete).onPress?.());

  expect(await screen.findByText(MESSAGES.couldntDelete)).toBeTruthy();
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: MESSAGES.delete })).toBeEnabled();
});
