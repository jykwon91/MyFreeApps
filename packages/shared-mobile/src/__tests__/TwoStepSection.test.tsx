import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { fetchTwoFactorEnabled } from "../auth/mobileAuthApi";
import { requestTwoStepDisable } from "../auth/twoStepApi";
import ToastProvider from "../components/ToastProvider";
import TwoStepSection from "../components/TwoStepSection";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useTwoStepStatus } from "../hooks/useTwoStepStatus";
import type { ConfirmOwner } from "../types/ConfirmOwner";
import type { TwoStepDisableResult } from "../types/TwoStepDisableResult";

jest.mock("../auth/mobileAuthApi");
jest.mock("../auth/twoStepApi");
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const status = jest.mocked(fetchTwoFactorEnabled);
const disable = jest.mocked(requestTwoStepDisable);
const OWNER = { confirmed: true, problem: null };

/** The section with the status a Security screen holds for it. */
function Section({ confirmOwner, onTurnOn, reloadSignal }: { confirmOwner: ConfirmOwner; onTurnOn: () => void; reloadSignal?: number }) {
  const status = useTwoStepStatus(reloadSignal);
  return <TwoStepSection confirmOwner={confirmOwner} onTurnOn={onTurnOn} status={status} whatItProtects="your books" />;
}

function serverFailure(httpStatus: number) {
  return Object.assign(new Error("refused"), { isAxiosError: true, response: { status: httpStatus } });
}

function open(confirmOwner = jest.fn().mockResolvedValue(OWNER), onTurnOn = jest.fn()) {
  return render(
    <ToastProvider bottomOffset={0}>
      <Section confirmOwner={confirmOwner} onTurnOn={onTurnOn} />
    </ToastProvider>,
  );
}

async function confirmTurnOffAlert() {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  await act(async () => {
    buttons?.find((button) => button.text === MESSAGES.confirmTurnOff)?.onPress?.();
  });
}

async function startTurningOff() {
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.turnOff }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  await confirmTurnOffAlert();
  await fireEvent.changeText(screen.getByLabelText(MESSAGES.turnOffCodeLabel), "123456");
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

describe("loading", () => {
  it("shows a skeleton with no buttons until it knows", async () => {
    status.mockReturnValue(new Promise(() => undefined));
    await open();
    expect(screen.getByTestId("two-step-skeleton")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["a server failure", serverFailure(500), MESSAGES.loadFailedServer],
    ["no connection", new Error("Network Error"), MESSAGES.loadFailedConnection],
  ])("says so on %s, never that it's off, and can try again", async (_name, error, body) => {
    status.mockRejectedValueOnce(error);
    await open();
    expect(await screen.findByText(MESSAGES.loadFailed)).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.turnOn)).toBeNull();

    status.mockResolvedValue(true);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByText(MESSAGES.onBody)).toBeTruthy();
  });
});

it("ignores an older answer that arrives after a newer one", async () => {
  let answerFirst: (value: boolean) => void = () => undefined;
  status.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
  status.mockResolvedValueOnce(true);
  const { rerender } = await open();
  await rerender(
    <ToastProvider bottomOffset={0}>
      <Section confirmOwner={jest.fn()} onTurnOn={jest.fn()} reloadSignal={1} />
    </ToastProvider>,
  );
  expect(await screen.findByText(MESSAGES.onBody)).toBeTruthy();
  await act(async () => answerFirst(false));
  expect(screen.getByText(MESSAGES.onBody)).toBeTruthy();
  expect(screen.queryByText(MESSAGES.offBody("your books"))).toBeNull();
});

describe("off", () => {
  beforeEach(() => status.mockResolvedValue(false));

  it("explains it", async () => {
    await open();
    expect(await screen.findByText(MESSAGES.offBody("your books"))).toBeTruthy();
  });

  it("asks it's the owner before going on", async () => {
    const onTurnOn = jest.fn();
    await open(jest.fn().mockResolvedValue(OWNER), onTurnOn);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.turnOn }));
    await waitFor(() => expect(onTurnOn).toHaveBeenCalledTimes(1));
  });

  it("stays put if the owner check says no, and shows why", async () => {
    const onTurnOn = jest.fn();
    await open(jest.fn().mockResolvedValue({ confirmed: false, problem: "I couldn't confirm it's you." }), onTurnOn);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.turnOn }));
    expect(await screen.findByText("I couldn't confirm it's you.")).toBeTruthy();
    expect(onTurnOn).not.toHaveBeenCalled();
  });
});

describe("turning off", () => {
  beforeEach(() => status.mockResolvedValue(true));

  it("needs a full code", async () => {
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.turnOff }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await confirmTurnOffAlert();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.turnOffCodeLabel), "12");
    expect(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }).props.accessibilityState?.disabled).toBe(true);
  });

  it("stays on if the owner check says no, and shows why", async () => {
    await open(jest.fn().mockResolvedValue({ confirmed: false, problem: "I couldn't confirm it's you." }));
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.turnOff }));
    expect(await screen.findByText("I couldn't confirm it's you.")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(MESSAGES.turnOffCodeLabel)).toBeNull();
    expect(disable).not.toHaveBeenCalled();
  });

  it("does nothing if the alert is cancelled", async () => {
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.turnOff }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(screen.queryByLabelText(MESSAGES.turnOffCodeLabel)).toBeNull();
  });

  it.each<[TwoStepDisableResult, string]>([
    ["turned_off", MESSAGES.turnedOff],
    ["already_off", MESSAGES.alreadyOff],
  ])("%s closes, says so and reloads", async (result, toast) => {
    disable.mockResolvedValue(result);
    await open();
    await startTurningOff();
    status.mockResolvedValue(false);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }));
    expect(await screen.findByText(toast)).toBeTruthy();
    expect(await screen.findByText(MESSAGES.offBody("your books"))).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.turnOffCodeLabel)).toBeNull();
  });

  it("a wrong code stays in the sheet and clears the field", async () => {
    disable.mockResolvedValue("wrong_code");
    await open();
    await startTurningOff();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }));
    expect(await screen.findByText(MESSAGES.wrongTurnOffCode)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.turnOffCodeLabel).props.value).toBe("");
  });

  it("too many tries says so", async () => {
    disable.mockResolvedValue("rate_limited");
    await open();
    await startTurningOff();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }));
    expect(await screen.findByText(MESSAGES.tooManyTries)).toBeTruthy();
  });

  it("shows off even if the reload after turning off fails", async () => {
    disable.mockResolvedValue("turned_off");
    await open();
    await startTurningOff();
    status.mockRejectedValue(new Error("Network Error"));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }));
    expect(await screen.findByText(MESSAGES.offBody("your books"))).toBeTruthy();
    expect(await screen.findByText(MESSAGES.refreshFailed)).toBeTruthy();
  });

  it("drops the unsure message once a read comes back", async () => {
    disable.mockResolvedValue("unknown");
    const view = await open();
    await startTurningOff();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }));
    await screen.findByText(MESSAGES.turnOffUnsure);

    await view.rerender(
      <ToastProvider bottomOffset={0}>
        <Section confirmOwner={jest.fn()} onTurnOn={jest.fn()} reloadSignal={1} />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.queryByText(MESSAGES.turnOffUnsure)).toBeNull());
  });

  it("no answer says it's unsure and keeps showing what it last read", async () => {
    disable.mockResolvedValue("unknown");
    await open();
    await startTurningOff();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.confirmTurnOff }));
    expect(await screen.findByText(MESSAGES.turnOffUnsure)).toBeTruthy();
    expect(screen.getByText(MESSAGES.onBody)).toBeTruthy();
  });
});
