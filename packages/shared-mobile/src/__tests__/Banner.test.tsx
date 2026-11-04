import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { SessionContext } from "../auth/SessionContext";
import Banner from "../components/Banner";
import AccountDeletedBanner from "../components/AccountDeletedBanner";
import SessionEndedBanner from "../components/SessionEndedBanner";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

describe("Banner", () => {
  it("announces its message and offers actions at the minimum touch size", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const onPress = jest.fn();
    await render(<Banner actions={[{ label: "Act", onPress }]} message="Heads up" />);

    expect(announce).toHaveBeenCalledWith("Heads up");
    const action = screen.getByRole("button", { name: "Act" });
    expect(StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("AccountDeletedBanner", () => {
  it("doesn't claim a deletion it couldn't confirm", async () => {
    await render(
      <SessionContext.Provider
        value={
          {
            getState: () => ({ status: "signedOut", endedByServer: false, lastEmail: null, accountDeleted: "unconfirmed" }),
            subscribe: () => () => {},
          } as unknown as MobileSession
        }
      >
        <AccountDeletedBanner />
      </SessionContext.Provider>,
    );
    expect(screen.getByText(/probably deleted/)).toBeTruthy();
    expect(screen.queryByText("Your account has been deleted.")).toBeNull();
  });

  it("shows only after the account is deleted, and can be dismissed", async () => {
    const dismissEndedNotice = jest.fn();
    const asSession = (state: SessionState) =>
      ({ getState: () => state, subscribe: () => () => {}, dismissEndedNotice }) as unknown as MobileSession;

    await render(
      <SessionContext.Provider value={asSession({ status: "signedOut", endedByServer: false, lastEmail: null })}>
        <AccountDeletedBanner />
      </SessionContext.Provider>,
    );
    expect(screen.queryByText("Your account has been deleted.")).toBeNull();

    await render(
      <SessionContext.Provider
        value={asSession({ status: "signedOut", endedByServer: false, lastEmail: null, accountDeleted: "confirmed" })}
      >
        <AccountDeletedBanner />
      </SessionContext.Provider>,
    );
    expect(screen.getByText("Your account has been deleted.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "OK" }));
    expect(dismissEndedNotice).toHaveBeenCalledTimes(1);
  });
});

describe("SessionEndedBanner", () => {
  const session = (state: SessionState, dismissEndedNotice = jest.fn()) =>
    ({ getState: () => state, subscribe: () => () => {}, dismissEndedNotice }) as unknown as MobileSession;

  it.each<SessionState>([
    { status: "restoring" },
    { status: "unreadable" },
    { status: "signedIn", email: "a", sessionId: "s" },
    { status: "signedOut", endedByServer: false, lastEmail: null },
  ])("stays hidden for %j", async (state) => {
    await render(
      <SessionContext.Provider value={session(state)}>
        <SessionEndedBanner onSignIn={jest.fn()} />
      </SessionContext.Provider>,
    );
    expect(screen.queryByText(/signed out on this device/)).toBeNull();
  });

  it("offers signing in or carrying on", async () => {
    const onSignIn = jest.fn();
    const dismiss = jest.fn();
    await render(
      <SessionContext.Provider value={session({ status: "signedOut", endedByServer: true, lastEmail: "a" }, dismiss)}>
        <SessionEndedBanner onSignIn={onSignIn} />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
