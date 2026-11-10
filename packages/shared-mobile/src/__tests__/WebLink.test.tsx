import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import ToastProvider from "../components/ToastProvider";
import WebLink from "../components/WebLink";

async function renderLink() {
  await render(
    <ToastProvider bottomOffset={0}>
      <WebLink label="Read the privacy policy" webBaseUrl="https://web.test" webPath="/privacy" />
    </ToastProvider>,
  );
}

describe("WebLink", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("opens its page on the website, and says it will", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderLink();
    const link = screen.getByRole("link", { name: "Read the privacy policy" });
    expect(link.props.accessibilityHint).toBe("Opens your browser");
    await fireEvent.press(link);
    expect(open).toHaveBeenCalledWith("https://web.test/privacy");
  });

  it("says so when the phone can't open the website", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"));
    await renderLink();
    await fireEvent.press(screen.getByRole("link", { name: "Read the privacy policy" }));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });
});
