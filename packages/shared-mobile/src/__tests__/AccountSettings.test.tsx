import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AxiosError, AxiosHeaders } from "axios";
import { Alert } from "react-native";
import { alertButton } from "../../test-support/alertButton";
import { SessionContext } from "../auth/SessionContext";
import { fetchDevices, revokeDevice } from "../auth/mobileAuthApi";
import AccountSettings from "../components/AccountSettings";
import ToastProvider from "../components/ToastProvider";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

jest.mock("../auth/mobileAuthApi");
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

const SIGNED_IN: SessionState = { status: "signedIn", email: "me@example.com", sessionId: "mine" };
const session = {
  signOut: jest.fn().mockResolvedValue({ serverReached: true }),
  getState: () => SIGNED_IN,
  subscribe: () => () => {},
} as unknown as MobileSession;

async function renderSettings(onDeleteAccount = jest.fn()) {
  await render(
    <SessionContext.Provider value={session}>
      <ToastProvider bottomOffset={0}>
        <AccountSettings appName="MyRecipes" onDeleteAccount={onDeleteAccount} />
      </ToastProvider>
    </SessionContext.Provider>,
  );
  return onDeleteAccount;
}

const THIS_PHONE = { id: "mine", device_name: "My iPhone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-02T00:00:00Z" };
const OTHER = { id: "older", device_name: "Old Pixel", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-03T00:00:00Z" };

/** What axios rejects with when no answer came back (offline, dropped, timed out). */
const lostAnswer = () => new AxiosError("Network Error", "ERR_NETWORK");

function refused(status: number, detail: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, { status, statusText: "", headers: {}, config, data: { detail } });
}

async function signOutOther(): Promise<void> {
  await fireEvent.press(await screen.findByRole("button", { name: "Sign out Old Pixel" }));
  await act(async () => alertButton("Sign out").onPress?.());
}

describe("AccountSettings", () => {
  beforeEach(() => {
    jest.mocked(fetchDevices).mockResolvedValue([
      { id: "mine", device_name: "My iPhone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-02T00:00:00Z" },
    ]);
  });

  it("loads this account's devices when it comes into view", async () => {
    await renderSettings();
    expect(await screen.findByText(/My iPhone/)).toBeTruthy();
    expect(screen.getByText(/signed in to your MyRecipes account/)).toBeTruthy();
    expect(fetchDevices).toHaveBeenCalledTimes(1);
  });

  it("shows what signing out reported as a toast", async () => {
    await renderSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out of this phone" }));
    expect(await screen.findByText("You're signed out.")).toBeTruthy();
  });

  it("hands deleting the account to the app", async () => {
    const onDeleteAccount = await renderSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    expect(onDeleteAccount).toHaveBeenCalled();
  });

  describe("signing another device out when the answer is lost", () => {
    beforeEach(() => {
      jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
      jest.mocked(fetchDevices).mockClear();
      jest.mocked(fetchDevices).mockResolvedValueOnce([THIS_PHONE, OTHER]);
      jest.mocked(revokeDevice).mockRejectedValue(lostAnswer());
    });

    afterEach(() => {
      jest.mocked(Alert.alert).mockRestore();
    });

    it("reads the list again, and says it's signed out once it's off the list", async () => {
      jest.mocked(fetchDevices).mockResolvedValueOnce([THIS_PHONE]);
      await renderSettings();
      await signOutOther();
      expect(await screen.findByText("Signed out Old Pixel. It may stay signed in for up to 30 minutes.")).toBeTruthy();
      expect(screen.queryByText("Old Pixel")).toBeNull();
      expect(screen.queryByText(/Couldn't sign out/)).toBeNull();
    });

    it("says it couldn't when a fresh list still has the device", async () => {
      jest.mocked(fetchDevices).mockResolvedValueOnce([THIS_PHONE, OTHER]);
      await renderSettings();
      await signOutOther();
      expect(await screen.findByText("Couldn't sign out Old Pixel. Check your connection and try again.")).toBeTruthy();
    });

    it("says it isn't sure, and that a retry is safe, when the list can't be read either", async () => {
      jest.mocked(fetchDevices).mockRejectedValueOnce(lostAnswer());
      await renderSettings();
      await signOutOther();
      expect(await screen.findByText("I didn't get an answer, so I'm not sure Old Pixel was signed out. Trying again is safe.")).toBeTruthy();
      expect(screen.queryByText(/Couldn't sign out/)).toBeNull();
      expect(screen.getByText("Old Pixel")).toBeTruthy();
    });

    it("keeps calling a real refusal a failure, without reading the list again", async () => {
      jest.mocked(revokeDevice).mockRejectedValue(refused(403, "Not allowed"));
      await renderSettings();
      await signOutOther();
      expect(await screen.findByText("Couldn't sign out Old Pixel. Check your connection and try again.")).toBeTruthy();
      expect(fetchDevices).toHaveBeenCalledTimes(1);
    });
  });
});
