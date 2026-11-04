import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { SessionContext } from "../auth/SessionContext";
import AccountSection from "../components/AccountSection";
import type { useDevices } from "../hooks/useDevices";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";
import type { SignedInDevice } from "../types/SignedInDevice";

const device = (id: string, name: string | null, lastUsed: string): SignedInDevice => ({
  id,
  device_name: name,
  created_at: "2026-10-01T00:00:00Z",
  last_used_at: lastUsed,
});

const SIGNED_IN: SessionState = { status: "signedIn", email: "me@example.com", sessionId: "mine" };
const THIS_PHONE = device("mine", "My iPhone", "2026-10-02T00:00:00Z");
const OLDER = device("older", "Old Pixel", "2026-10-03T00:00:00Z");
const NEWER = device("newer", null, "2026-10-04T00:00:00Z");

function setUp(overrides: Partial<ReturnType<typeof useDevices>> = {}, signOut = jest.fn()) {
  const devices = {
    devices: [OLDER, NEWER, THIS_PHONE],
    hasError: false,
    reload: jest.fn().mockResolvedValue(undefined),
    signOutDevice: jest.fn().mockResolvedValue("signedOut"),
    ...overrides,
  };
  const session = {
    signOut,
    getState: () => SIGNED_IN,
    subscribe: () => () => {},
  } as unknown as MobileSession;
  const onMessage = jest.fn();
  return {
    devices,
    onMessage,
    view: (
      <SessionContext.Provider value={session}>
        <AccountSection appName="MyRecipes" devices={devices} onMessage={onMessage} />
      </SessionContext.Provider>
    ),
  };
}

/** Taps the destructive button on the confirmation. */
async function confirmAlert() {
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2];
  buttons?.find((button) => button.style === "destructive")?.onPress?.();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AccountSection", () => {
  it("says who's signed in and states the 30-minute limit", async () => {
    await render(setUp().view);
    expect(screen.getByText("Signed in as me@example.com")).toBeTruthy();
    expect(screen.getByText(/can stay signed in for up to 30 minutes/)).toBeTruthy();
  });

  it("puts this phone first, marked in words and with no sign-out, then the rest by last use", async () => {
    await render(setUp().view);
    const names = screen.getAllByText(/^(My iPhone|Old Pixel|Unknown device)$/).map((node) => node.props.children);
    expect(names).toEqual(["My iPhone", "Unknown device", "Old Pixel"]);
    expect(screen.getByText("This device")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out My iPhone" })).toBeNull();
  });

  it("confirms before signing another device out, with the honest limit", async () => {
    const { view, devices, onMessage } = setUp();
    await render(view);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out Old Pixel" }));

    expect(devices.signOutDevice).not.toHaveBeenCalled();
    const [title, body] = jest.mocked(Alert.alert).mock.lastCall ?? [];
    expect(title).toBe("Sign out Old Pixel?");
    expect(body).toContain("up to 30 minutes");

    await confirmAlert();
    expect(devices.signOutDevice).toHaveBeenCalledWith("older");
    expect(onMessage).toHaveBeenCalledWith({
      message: "Signed out Old Pixel. It may stay signed in for up to 30 minutes.",
      variant: "success",
    });
  });

  it("reports a device that was already gone", async () => {
    const { view, onMessage } = setUp({ signOutDevice: jest.fn().mockResolvedValue("alreadyGone") });
    await render(view);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out Old Pixel" }));
    await confirmAlert();
    expect(onMessage).toHaveBeenCalledWith({ message: "That device was already signed out.", variant: "success" });
  });

  it("reports a failure", async () => {
    const { view, onMessage } = setUp({ signOutDevice: jest.fn().mockRejectedValue(new Error("offline")) });
    await render(view);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out Old Pixel" }));
    await confirmAlert();
    expect(onMessage).toHaveBeenCalledWith({
      message: "Couldn't sign out Old Pixel. Check your connection and try again.",
      variant: "error",
    });
  });

  it("shows skeletons while loading", async () => {
    await render(setUp({ devices: null }).view);
    expect(screen.getAllByTestId("device-skeleton", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("offers a retry when the list won't load, and leaves sign-out usable", async () => {
    const { view, devices } = setUp({ devices: null, hasError: true });
    await render(view);
    expect(screen.getByText(/Couldn't load your devices/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out of this phone" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(devices.reload).toHaveBeenCalledTimes(1);
  });

  it("signs this phone out without a confirmation", async () => {
    const signOut = jest.fn().mockResolvedValue({ serverReached: true });
    const { view, onMessage } = setUp({}, signOut);
    await render(view);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out of this phone" }));
    expect(onMessage).toHaveBeenCalledWith({ message: "You're signed out.", variant: "success" });
  });

  it("is honest when the server wasn't told", async () => {
    const signOut = jest.fn().mockResolvedValue({ serverReached: false });
    const { view, onMessage } = setUp({}, signOut);
    await render(view);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out of this phone" }));
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("may still appear in your device list") }),
    );
  });
});
