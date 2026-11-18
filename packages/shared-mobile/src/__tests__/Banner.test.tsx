import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { SessionContext } from "../auth/SessionContext";
import Banner from "../components/Banner";
import AccountDeletedBanner from "../components/AccountDeletedBanner";
import SessionEndedBanner from "../components/SessionEndedBanner";
import { lightColors } from "../theme/colors";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

describe("Banner", () => {
  it("announces its message and offers actions at the minimum touch size", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const onPress = jest.fn();
    await render(<Banner actions={[{ label: "Act", onPress }]} message="Heads up" />);

    expect(announce).toHaveBeenCalledWith("Heads up");
    expect(screen.getByRole("alert")).toHaveTextContent("Heads up");
    const action = screen.getByRole("button", { name: "Act" });
    expect(StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner and ignores more taps while an action's promise is pending", async () => {
    let finish: () => void = () => undefined;
    const onPress = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await render(<Banner actions={[{ label: "Try again", onPress }]} message="Couldn't load" />);
    const action = screen.getByRole("button", { name: "Try again" });
    expect(action).not.toBeBusy();
    expect(screen.queryByTestId("banner-action-spinner")).toBeNull();

    await fireEvent.press(action);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Try again" })).toBeBusy();
    expect(screen.getByTestId("banner-action-spinner")).toBeTruthy();

    await act(async () => {
      finish();
    });
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeBusy();
    expect(screen.queryByTestId("banner-action-spinner")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("stays tappable after a sync action", async () => {
    const onPress = jest.fn();
    await render(<Banner actions={[{ label: "Go", onPress }]} message="Heads up" />);
    await fireEvent.press(screen.getByRole("button", { name: "Go" }));
    await fireEvent.press(screen.getByRole("button", { name: "Go" }));
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("banner-action-spinner")).toBeNull();
  });

  it("reads the info tone politely, not as an alert, in the same weights as the others", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const announcePolitely = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
    announce.mockClear();
    await render(<Banner message="Good to know" tone="info" />);

    expect(announcePolitely).toHaveBeenCalledWith("Good to know", { queue: true });
    expect(announce).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    const text = screen.getByText("Good to know");
    expect(StyleSheet.flatten(text.props.style).color).toBe(lightColors.toastInfoForeground);
    const box = StyleSheet.flatten(text.parent?.props.style);
    expect(box.backgroundColor).toBe(lightColors.toastInfoBackground);
    expect(box.borderColor).toBe(lightColors.toastInfoBorder);
  });
});

describe("AccountDeletedBanner", () => {
  it("doesn't claim a deletion it couldn't confirm", async () => {
    const state: SessionState = { status: "signedOut", endedByServer: false, lastEmail: null, accountDeleted: "unconfirmed" };
    const session = { getState: () => state, subscribe: () => () => {} } as unknown as MobileSession;
    await render(
      <SessionContext.Provider value={session}>
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
