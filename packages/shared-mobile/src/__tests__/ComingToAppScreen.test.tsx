import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import ComingToAppScreen from "../components/ComingToAppScreen";
import ToastProvider from "../components/ToastProvider";

async function renderScreen() {
  await render(
    <ToastProvider bottomOffset={0}>
      <ComingToAppScreen title="Applications" webBaseUrl="https://web.test" webPath="/applications" />
    </ToastProvider>,
  );
}

describe("ComingToAppScreen", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("names the screen and opens its page on the website", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen();
    expect(screen.getByRole("header", { name: "Applications" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open on the website" }));
    expect(open).toHaveBeenCalledWith("https://web.test/applications");
  });

  it("says so when the phone can't open the website", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"));
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Open on the website" }));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });
});
