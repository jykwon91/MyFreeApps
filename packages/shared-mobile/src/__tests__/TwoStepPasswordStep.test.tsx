import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { requestTwoStepSetup } from "../auth/twoStepApi";
import TwoStepPasswordStep from "../components/TwoStepPasswordStep";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import type { TwoStepSetupResult } from "../types/TwoStepSetupResult";

jest.mock("../auth/twoStepApi");

const setUp = jest.mocked(requestTwoStepSetup);

async function open() {
  const onStarted = jest.fn();
  await render(<TwoStepPasswordStep appName="MyRecipes" notice={null} onAlreadyOn={jest.fn()} onStarted={onStarted} />);
  return onStarted;
}

beforeEach(() => setUp.mockReset());

it("continues from the keyboard's Go key", async () => {
  setUp.mockResolvedValue({ outcome: "already_on" });
  await open();
  const password = screen.getByLabelText(MESSAGES.password);
  expect(password.props.returnKeyType).toBe("go");

  await fireEvent.changeText(password, "pw");
  await fireEvent(screen.getByLabelText(MESSAGES.password), "submitEditing");

  expect(setUp).toHaveBeenCalledWith("pw");
});

it("sends nothing from the keyboard until there's a password, nor twice while it's sending", async () => {
  let answer = (_result: TwoStepSetupResult): void => undefined;
  setUp.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  await open();

  await fireEvent(screen.getByLabelText(MESSAGES.password), "submitEditing");
  expect(setUp).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText(MESSAGES.password), "pw");
  await fireEvent(screen.getByLabelText(MESSAGES.password), "submitEditing");
  await fireEvent(screen.getByLabelText(MESSAGES.password), "submitEditing");
  expect(setUp).toHaveBeenCalledTimes(1);
  await act(async () => answer({ outcome: "already_on" }));
});

it("asks for one setup when Go is followed by a tap on Continue, and shows it getting ready", async () => {
  let answer = (_result: TwoStepSetupResult): void => undefined;
  setUp.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  await open();
  await fireEvent.changeText(screen.getByLabelText(MESSAGES.password), "pw");
  await fireEvent(screen.getByLabelText(MESSAGES.password), "submitEditing");

  expect(screen.getByTestId("loading-button-spinner")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.gettingReady }));
  expect(setUp).toHaveBeenCalledTimes(1);
  await act(async () => answer({ outcome: "already_on" }));
});

it("asks for one setup when Continue is tapped and then Go pressed", async () => {
  let answer = (_result: TwoStepSetupResult): void => undefined;
  setUp.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  await open();
  await fireEvent.changeText(screen.getByLabelText(MESSAGES.password), "pw");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.continue }));
  await fireEvent(screen.getByLabelText(MESSAGES.password), "submitEditing");
  expect(setUp).toHaveBeenCalledTimes(1);
  await act(async () => answer({ outcome: "already_on" }));
});
