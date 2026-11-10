import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Linking } from "react-native";
import MoreRow from "../components/MoreRow";
import ToastProvider from "../components/ToastProvider";
import type { MoreRowProps } from "../types/MoreRowProps";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

async function renderRow(props: Omit<MoreRowProps, "webBaseUrl">) {
  await render(
    <ToastProvider bottomOffset={0}>
      <MoreRow webBaseUrl="https://web.test" {...props} />
    </ToastProvider>,
  );
}

describe("MoreRow", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("opens the website page of something the app hasn't built", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderRow({ item: { label: "Documents", webPath: "/documents" } });
    const row = screen.getByRole("link", { name: "Documents" });
    expect(row.props.accessibilityHint).toBe("Opens your browser");
    await fireEvent.press(row);
    expect(open).toHaveBeenCalledWith("https://web.test/documents");
  });

  it("opens the app's own screen when it has one", async () => {
    const open = jest.spyOn(Linking, "openURL");
    await renderRow({ item: { label: "Vendors", webPath: "/vendors", screen: "/vendors" } });
    await fireEvent.press(screen.getByRole("button", { name: "Vendors" }));
    expect(router.push).toHaveBeenCalledWith("/vendors");
    expect(open).not.toHaveBeenCalled();
  });

  it("runs its own action and reads out the line under the label", async () => {
    const onPress = jest.fn();
    await renderRow({ item: { label: "Account", screen: "/more" }, onPress, secondary: "Settings" });
    await fireEvent.press(screen.getByRole("button", { name: "Account, Settings" }));
    expect(onPress).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalledWith("/more");
  });

  it("says so when the phone can't open the website", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"));
    await renderRow({ item: { label: "Documents", webPath: "/documents" } });
    await fireEvent.press(screen.getByRole("link", { name: "Documents" }));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });
});
