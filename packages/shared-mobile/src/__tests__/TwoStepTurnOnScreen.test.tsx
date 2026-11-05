import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { setStringAsync } from "expo-clipboard";
import { usePreventScreenCapture } from "expo-screen-capture";
import { Linking, Share } from "react-native";
import { fetchTwoFactorEnabled } from "../auth/mobileAuthApi";
import { requestTwoStepDisable, requestTwoStepSetup, requestTwoStepVerify } from "../auth/twoStepApi";
import ToastProvider from "../components/ToastProvider";
import TwoStepTurnOnScreen from "../components/TwoStepTurnOnScreen";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import type { TwoStepVerifyResult } from "../types/TwoStepVerifyResult";

jest.mock("../auth/mobileAuthApi");
jest.mock("../auth/twoStepApi");
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock("expo-screen-capture", () => ({ usePreventScreenCapture: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const setup = jest.mocked(requestTwoStepSetup);
const verify = jest.mocked(requestTwoStepVerify);
const disable = jest.mocked(requestTwoStepDisable);
const status = jest.mocked(fetchTwoFactorEnabled);
const copy = jest.mocked(setStringAsync);
const SETUP = {
  secret: "ABCDEFGHIJ",
  provisioning_uri: "otpauth://totp/x",
  algorithm: "sha256",
  digits: 6,
  period: 30,
} as const;
const CODES = ["AAAA1111", "BBBB2222"];
const ALL_CODES = "AAAA1111\nBBBB2222";

async function open() {
  const onFinished = jest.fn();
  const onLeaveRiskChange = jest.fn();
  await render(
    <ToastProvider bottomOffset={0}>
      <TwoStepTurnOnScreen appName="MyBookkeeper" onFinished={onFinished} onLeaveRiskChange={onLeaveRiskChange} />
    </ToastProvider>,
  );
  return { onFinished, onLeaveRiskChange };
}

async function sendPassword() {
  await fireEvent.changeText(screen.getByLabelText(MESSAGES.password), "pw");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.continue }));
}

async function openAddStep() {
  setup.mockResolvedValue({ outcome: "started", setup: SETUP });
  const callbacks = await open();
  await sendPassword();
  await screen.findByText(MESSAGES.addHeading("MyBookkeeper"));
  return callbacks;
}

async function sendCode(result: TwoStepVerifyResult) {
  verify.mockResolvedValue(result);
  await fireEvent.changeText(screen.getByLabelText(MESSAGES.codeLabel), "123456");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOn }));
}

beforeEach(() => jest.clearAllMocks());

describe("password", () => {
  it("won't send an empty one", async () => {
    await open();
    expect(screen.getByRole("button", { name: MESSAGES.continue }).props.accessibilityState?.disabled).toBe(true);
  });

  it("a wrong one clears and says so", async () => {
    setup.mockResolvedValue({ outcome: "wrong_password" });
    await open();
    await sendPassword();
    expect(await screen.findByText(MESSAGES.wrongPassword)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.password).props.value).toBe("");
  });

  it("too many tries says sign-in is blocked", async () => {
    setup.mockResolvedValue({ outcome: "rate_limited" });
    await open();
    await sendPassword();
    expect(await screen.findByText(MESSAGES.tooManyTries)).toBeTruthy();
  });

  it("a failure says to try again and to clear out an older entry", async () => {
    setup.mockResolvedValue({ outcome: "failed" });
    await open();
    await sendPassword();
    expect(await screen.findByText(`${MESSAGES.startFailed} ${MESSAGES.deleteOlderEntry("MyBookkeeper")}`)).toBeTruthy();
  });

  it("already on says so and leaves", async () => {
    setup.mockResolvedValue({ outcome: "already_on" });
    const { onFinished } = await open();
    await sendPassword();
    expect(await screen.findByText(MESSAGES.alreadyOnToast)).toBeTruthy();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});

describe("adding to the authenticator", () => {
  it("says to clear out an older entry, since each setup makes a new key", async () => {
    await openAddStep();
    expect(screen.getByText(MESSAGES.deleteOlderEntry("MyBookkeeper"))).toBeTruthy();
  });

  it("doesn't block screenshots until the key shows", async () => {
    await openAddStep();
    expect(usePreventScreenCapture).not.toHaveBeenCalled();
  });

  it("opens the app with the server's link", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await openAddStep();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.openAuthenticator }));
    expect(openURL).toHaveBeenCalledWith(SETUP.provisioning_uri);
  });

  it("with no app, says what to do and shows the key", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
    await openAddStep();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.openAuthenticator }));
    expect(await screen.findByText(MESSAGES.noAuthenticator)).toBeTruthy();
    expect(screen.getByText("ABCD EFGH IJ")).toBeTruthy();
  });

  it("shows the key in fours with the server's settings, and copies it without the spaces", async () => {
    await openAddStep();
    expect(screen.queryByText("ABCD EFGH IJ")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.showKey }));
    expect(screen.getByText("ABCD EFGH IJ")).toBeTruthy();
    expect(screen.getByText(MESSAGES.settings("SHA-256", 6, 30))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.copyKey }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(SETUP.secret, expect.anything()));
    expect(screen.getByText(MESSAGES.keyScreenshotsOff)).toBeTruthy();
    expect(screen.getByLabelText("A B C D E F G H I J")).toBeTruthy();
    expect(usePreventScreenCapture).toHaveBeenCalled();
  });

  it("won't send a short code, and doesn't send one by itself", async () => {
    await openAddStep();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.codeLabel), "123");
    expect(screen.getByRole("button", { name: MESSAGES.confirmTurnOn }).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.codeLabel), "123456");
    expect(verify).not.toHaveBeenCalled();
  });

  it("a wrong code clears the field", async () => {
    await openAddStep();
    await sendCode({ outcome: "wrong_code" });
    expect(await screen.findByText(MESSAGES.wrongSetupCode)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.codeLabel).props.value).toBe("");
  });

  it("too many tries says so", async () => {
    await openAddStep();
    await sendCode({ outcome: "rate_limited" });
    expect(await screen.findByText(MESSAGES.tooManyTries)).toBeTruthy();
  });

  it("a setup that's gone starts again from the password", async () => {
    await openAddStep();
    await sendCode({ outcome: "not_started" });
    expect(await screen.findByText(MESSAGES.restarted)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.password)).toBeTruthy();
  });
});

describe("a lost answer", () => {
  it("that did turn on says the codes are gone, and offers both ways out", async () => {
    status.mockResolvedValue(true);
    const { onFinished } = await openAddStep();
    await sendCode({ outcome: "unknown" });
    expect(await screen.findByText(MESSAGES.lostOnHeading)).toBeTruthy();
    expect(screen.getByText(MESSAGES.lostOnNote)).toBeTruthy();
    expect(verify).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.keepOn }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("can be turned off to start over", async () => {
    status.mockResolvedValue(true);
    disable.mockResolvedValue("turned_off");
    await openAddStep();
    await sendCode({ outcome: "already_on" });
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.startOver }));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.turnOffCodeLabel), "654321");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }));
    expect(await screen.findByLabelText(MESSAGES.password)).toBeTruthy();
  });

  it("that didn't turn on asks for a new code, not the same one", async () => {
    status.mockResolvedValue(false);
    await openAddStep();
    await sendCode({ outcome: "unknown" });
    expect(await screen.findByText(MESSAGES.notThrough)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.codeLabel).props.value).toBe("");
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("twice in a row still clears the spent code and still says why", async () => {
    status.mockResolvedValue(false);
    await openAddStep();
    await sendCode({ outcome: "unknown" });
    await screen.findByText(MESSAGES.notThrough);
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.codeLabel), "222222");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOn }));

    expect(await screen.findByText(MESSAGES.notThrough)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.codeLabel).props.value).toBe("");
    expect(screen.getByRole("button", { name: MESSAGES.confirmTurnOn }).props.accessibilityState?.disabled).toBe(true);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("that can't be read says so and can check again", async () => {
    status.mockRejectedValueOnce(new Error("Network Error"));
    await openAddStep();
    await sendCode({ outcome: "unknown" });
    expect(await screen.findByText(MESSAGES.unsure)).toBeTruthy();
    status.mockResolvedValue(true);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.checkAgain }));
    expect(await screen.findByText(MESSAGES.lostOnHeading)).toBeTruthy();
    expect(verify).toHaveBeenCalledTimes(1);
  });
});

describe("recovery codes", () => {
  async function showCodes() {
    const callbacks = await openAddStep();
    await sendCode({ outcome: "turned_on", recoveryCodes: CODES });
    await screen.findByText(MESSAGES.codesHeading);
    return callbacks;
  }

  it("shows them, blocks screenshots and guards leaving", async () => {
    const { onLeaveRiskChange } = await showCodes();
    expect(screen.getByText("AAAA1111")).toBeTruthy();
    expect(screen.getByText("BBBB2222")).toBeTruthy();
    expect(screen.getByText(MESSAGES.screenshotsOff)).toBeTruthy();
    expect(usePreventScreenCapture).toHaveBeenCalled();
    expect(onLeaveRiskChange).toHaveBeenLastCalledWith("codes");
  });

  it("Done waits for the tick, then lifts the guard and leaves", async () => {
    const { onFinished, onLeaveRiskChange } = await showCodes();
    expect(screen.getByRole("button", { name: MESSAGES.done }).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("checkbox", { name: new RegExp(MESSAGES.saved) }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.done }));
    expect(onLeaveRiskChange).toHaveBeenLastCalledWith("none");
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("shares them", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
    await showCodes();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.share }));
    expect(share).toHaveBeenCalledWith({ message: ALL_CODES });
  });

  it("copies them", async () => {
    await showCodes();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.copyAll }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(ALL_CODES, expect.anything()));
    expect(await screen.findByText(MESSAGES.codesCopied)).toBeTruthy();
  });

  it("says when sharing failed, not copying", async () => {
    jest.spyOn(Share, "share").mockRejectedValue(new Error("no"));
    await showCodes();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.share }));
    expect(await screen.findByText(MESSAGES.shareFailed)).toBeTruthy();
  });
});

describe("leaving", () => {
  it("is at risk from sending the code until the answer is dealt with", async () => {
    let answer: (result: TwoStepVerifyResult) => void = () => undefined;
    verify.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { onLeaveRiskChange } = await openAddStep();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.codeLabel), "123456");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOn }));
    expect(onLeaveRiskChange).toHaveBeenLastCalledWith("turning_on");

    await act(async () => answer({ outcome: "wrong_code" }));
    expect(onLeaveRiskChange).toHaveBeenLastCalledWith("none");
  });

  it("stays at risk while finding out what a lost answer did", async () => {
    let answer: (isOn: boolean) => void = () => undefined;
    status.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { onLeaveRiskChange } = await openAddStep();
    await sendCode({ outcome: "unknown" });
    expect(onLeaveRiskChange).toHaveBeenLastCalledWith("turning_on");

    await act(async () => answer(true));
    expect(onLeaveRiskChange).toHaveBeenLastCalledWith("none");
  });
});
