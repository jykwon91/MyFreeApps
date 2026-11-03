import { renderHook } from "@testing-library/react-native";
import { useCookTimerAlertTaps } from "../src/features/cook/useCookTimerAlertTaps";
import { showCookTimerAlertsInForeground } from "../src/services/cookTimerNotifications";

const mockPush = jest.fn();
const mockRemove = jest.fn();
const mockClear = jest.fn();
let mockLast: object | null = null;
let mockListener: (response: object) => void = () => {};
const mockSetHandler = jest.fn();

jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("expo-notifications", () => ({
  __esModule: true,
  addNotificationResponseReceivedListener: (listener: (response: object) => void) => {
    mockListener = listener;
    return { remove: mockRemove };
  },
  clearLastNotificationResponse: () => mockClear(),
  getLastNotificationResponse: () => mockLast,
  setNotificationHandler: (handler: unknown) => mockSetHandler(handler),
}));

const TIMER = { id: "s1-600", recipeId: "r9", recipeTitle: "Soup", stepNumber: 1, seconds: 600, endsAt: 5 };
const tap = (data: object) => ({ notification: { request: { content: { data } } } });
const COOK = { pathname: "/recipes/[id]/cook", params: { id: "r9" } };

describe("tapping a timer alert", () => {
  beforeEach(() => {
    mockLast = null;
    jest.clearAllMocks();
  });

  it("opens the recipe when the app is running, and stops listening on unmount", async () => {
    const { unmount } = await renderHook(() => useCookTimerAlertTaps());
    expect(mockPush).not.toHaveBeenCalled();

    mockListener(tap({ timer: TIMER }));
    expect(mockPush).toHaveBeenCalledWith(COOK);

    await unmount();
    expect(mockRemove).toHaveBeenCalled();
  });

  it("opens the recipe when the tap is what launched the app, once", async () => {
    mockLast = tap({ timer: TIMER });
    await renderHook(() => useCookTimerAlertTaps());

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(COOK);
    expect(mockClear).toHaveBeenCalled();
  });

  it("ignores any other notification", async () => {
    await renderHook(() => useCookTimerAlertTaps());
    mockListener(tap({}));
    mockListener(tap({ timer: { id: "broken" } }));

    expect(mockPush).not.toHaveBeenCalled();
  });
});

it("shows an alert that goes off with the app open", async () => {
  showCookTimerAlertsInForeground();
  const { handleNotification } = mockSetHandler.mock.calls[0]![0];

  await expect(handleNotification()).resolves.toMatchObject({ shouldPlaySound: true, shouldShowBanner: true });
});
