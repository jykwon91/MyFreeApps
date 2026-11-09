import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import CalendarScreen from "../src/features/calendar/CalendarScreen";
import ReviewQueueScreen from "../src/features/calendarReview/ReviewQueueScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aQueueItem, startCalendarServer } from "../test-support/calendarServer";
import { holdWrites } from "../test-support/holdWrites";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

async function renderQueue() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ReviewQueueScreen />
      </ToastProvider>
    </Provider>,
  );
}

async function renderCalendar() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CalendarScreen />
      </ToastProvider>
    </Provider>,
  );
}

function alertButton(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  return buttons?.find((button) => button.text === label);
}

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

describe("the review queue", () => {
  it("shows what each booking email said, with its channel", async () => {
    startCalendarServer({ queue: [aQueueItem()] });
    await renderQueue();
    expect(await screen.findByText("Reservation confirmed - Sam Lee")).toBeTruthy();
    expect(screen.getByText("Airbnb")).toBeTruthy();
    expect(screen.getByText("Sam Lee")).toBeTruthy();
    expect(screen.getByText("Dec 2, 2026 – Dec 6, 2026")).toBeTruthy();
    expect(screen.getByText("$640.00")).toBeTruthy();
  });

  it("manages with an email that carried no dates, guest or price", async () => {
    startCalendarServer({
      queue: [aQueueItem({ source_channel: "booking_com", parsed_payload: { ...aQueueItem().parsed_payload, guest_name: null, check_in: null, check_out: null, total_price: null, raw_subject: "" } })],
    });
    await renderQueue();
    expect(await screen.findByText("Booking confirmation")).toBeTruthy();
    expect(screen.getByText("Booking.com")).toBeTruthy();
  });

  it("shows a skeleton while loading, then an all clear when nothing waits", async () => {
    startCalendarServer();
    const answered = api.defaults.adapter!;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      if (config.url === "/calendar/review-queue") await gate;
      return (answered as (c: typeof config) => Promise<never>)(config);
    };
    await renderQueue();
    expect(await screen.findByTestId("review-queue-skeleton")).toBeTruthy();
    await act(async () => release());
    expect(await screen.findByText("All clear.")).toBeTruthy();
  });

  it("offers a retry when it can't load, and recovers", async () => {
    const server = startCalendarServer({ queue: "fail" });
    await renderQueue();
    expect(await screen.findByText("I couldn't load the review queue.")).toBeTruthy();
    server.queue = [aQueueItem()];
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Reservation confirmed - Sam Lee")).toBeTruthy();
  });

  it("adds a booking to the listing picked, and it leaves the queue", async () => {
    const server = startCalendarServer({ queue: [aQueueItem()] });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Add booking" }));
    expect(screen.getByText("Add to which listing?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Birch Room" }));

    expect(await screen.findByText("Booking added to your calendar.")).toBeTruthy();
    const resolve = server.requests.find((request) => request.url === "/calendar/review-queue/q1/resolve");
    expect(JSON.parse(resolve!.data as string)).toEqual({ listing_id: "li2" });
    await waitFor(() => expect(screen.queryByText("Reservation confirmed - Sam Lee")).toBeNull());
    expect(await screen.findByText("All clear.")).toBeTruthy();
  });

  it("ignores a listing forever only after asking, using the channel's own listing id", async () => {
    const server = startCalendarServer({ queue: [aQueueItem()] });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Ignore forever" }));
    expect(server.requests.some((request) => request.url?.endsWith("/ignore"))).toBe(false);
    await act(async () => alertButton("Ignore forever")?.onPress?.());

    expect(await screen.findByText("I'll ignore that listing from now on.")).toBeTruthy();
    const ignore = server.requests.find((request) => request.url === "/calendar/review-queue/q1/ignore");
    expect(JSON.parse(ignore!.data as string)).toEqual({ source_listing_id: "air-77" });
  });

  it("falls back to the email's id when the channel gave no listing id", async () => {
    const server = startCalendarServer({ queue: [aQueueItem({ parsed_payload: { ...aQueueItem().parsed_payload, source_listing_id: null } })] });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Ignore forever" }));
    await act(async () => alertButton("Ignore forever")?.onPress?.());
    await screen.findByText("I'll ignore that listing from now on.");
    const ignore = server.requests.find((request) => request.url?.endsWith("/ignore"));
    expect(JSON.parse(ignore!.data as string)).toEqual({ source_listing_id: "m1" });
  });

  it("leaves the booking alone when ignoring is called off", async () => {
    const server = startCalendarServer({ queue: [aQueueItem()] });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Ignore forever" }));
    await act(async () => alertButton("Cancel")?.onPress?.());
    expect(server.requests.some((request) => request.url?.endsWith("/ignore"))).toBe(false);
    expect(screen.getByText("Reservation confirmed - Sam Lee")).toBeTruthy();
  });

  it("dismisses an item", async () => {
    const server = startCalendarServer({ queue: [aQueueItem()] });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("Dismissed.")).toBeTruthy();
    expect(server.requests.some((request) => request.method === "delete" && request.url === "/calendar/review-queue/q1")).toBe(true);
  });

  it("shows a busy button the moment it's pressed, and blocks the other choices", async () => {
    startCalendarServer({ queue: [aQueueItem()] });
    await renderQueue();
    await screen.findByText("Reservation confirmed - Sam Lee");
    holdWrites();
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    expect(await screen.findByRole("button", { name: "Dismissing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add booking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ignore forever" })).toBeDisabled();
  });

  it.each([
    [403, "You have view-only access."],
    [404, "That booking was already handled, or it's gone."],
    [409, "That booking was already handled, or it's gone."],
    [422, "That listing can't take this booking. Pick another or check the dates."],
    [500, "I couldn't add this booking. Try again?"],
  ])("says what went wrong adding on a %i, keeps the item, and never shows the server's words", async (status, message) => {
    const server = startCalendarServer({ queue: [aQueueItem()], writeFailure: status });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Add booking" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Maple Room" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByText("Reservation confirmed - Sam Lee")).toBeTruthy();
    expect(server.queue).toHaveLength(1);
  });

  it("says so when ignoring or dismissing fails, and when the phone is offline", async () => {
    const server = startCalendarServer({ queue: [aQueueItem()], writeFailure: 500 });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("I couldn't dismiss this item. Try again?")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Ignore forever" }));
    await act(async () => alertButton("Ignore forever")?.onPress?.());
    expect(await screen.findByText("I couldn't ignore this booking. Try again?")).toBeTruthy();

    server.writeFailure = null;
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(server.requests.filter((request) => request.method === "delete")).toHaveLength(2));
    expect(await screen.findAllByText("I couldn't dismiss this item. Try again?")).not.toHaveLength(0);
  });

  it("tells someone who can only read, and offers no decisions", async () => {
    const server = startCalendarServer({ queue: [aQueueItem()], role: "viewer" });
    await renderQueue();
    expect(await screen.findByText("Reservation confirmed - Sam Lee")).toBeTruthy();
    await screen.findByText("You have view-only access, so you can look but not decide.");
    expect(screen.queryByRole("button", { name: "Add booking" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ignore forever" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(server.requests.some((request) => request.url === "/listings")).toBe(false);
  });

  it("says when there are no listings to add a booking to", async () => {
    startCalendarServer({ queue: [aQueueItem()], listings: [] });
    await renderQueue();
    await fireEvent.press(await screen.findByRole("button", { name: "Add booking" }));
    expect(screen.getByText("You have no listings yet. Add one on the website first.")).toBeTruthy();
  });
});

describe("getting to the review queue from the calendar", () => {
  it("shows how many wait and opens the queue", async () => {
    startCalendarServer({ queue: [aQueueItem(), aQueueItem({ id: "q2" })] });
    await renderCalendar();
    expect(await screen.findByText("2 bookings need your review.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(mockPush).toHaveBeenCalledWith("/calendar/review");
  });

  it("is still one tap away with nothing waiting", async () => {
    startCalendarServer();
    await renderCalendar();
    await fireEvent.press(await screen.findByRole("button", { name: "Review queue" }));
    expect(mockPush).toHaveBeenCalledWith("/calendar/review");
  });
});
