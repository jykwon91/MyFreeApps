import { render, screen } from "@testing-library/react-native";
import ToastProvider from "../components/ToastProvider";
import TwoStepRecoveryCodes from "../components/TwoStepRecoveryCodes";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock("expo-screen-capture", () => ({ usePreventScreenCapture: jest.fn() }));

describe("TwoStepRecoveryCodes", () => {
  it("reads each code one character at a time so it can be written down from speech", async () => {
    await render(
      <ToastProvider bottomOffset={0}>
        <TwoStepRecoveryCodes codes={["4821-9930", "AAAA1111"]} onDone={jest.fn()} />
      </ToastProvider>,
    );

    expect(screen.getByLabelText("4 8 2 1 - 9 9 3 0")).toHaveTextContent("4821-9930");
    expect(screen.getByLabelText("A A A A 1 1 1 1")).toHaveTextContent("AAAA1111");
  });
});
