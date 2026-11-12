import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { Linking } from "react-native";
import MoreMenuGroups from "../components/MoreMenuGroups";
import ToastProvider from "../components/ToastProvider";
import { lightColors } from "../theme/colors";
import type { MoreMenuGroup } from "../types/MoreMenuGroup";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const GROUPS: readonly MoreMenuGroup[] = [
  { title: "Work", items: [{ label: "Companies", webPath: "/companies", screen: "/companies" }] },
  { title: "Account", items: [{ label: "Security", webPath: "/security" }, { label: "Support MyFreeApps", webPath: "/support-myfreeapps" }] },
];

async function renderGroups() {
  await render(
    <ToastProvider bottomOffset={0}>
      <MoreMenuGroups groups={GROUPS} webBaseUrl="https://web.test" />
    </ToastProvider>,
  );
}

describe("MoreMenuGroups", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("heads each group with its title, in order, in the muted heading style", async () => {
    await renderGroups();
    const headings = screen.getAllByRole("header");
    expect(headings.map((heading) => heading.props.children)).toEqual(["Work", "Account"]);
    expect(headings[0]).toHaveStyle({ color: lightColors.mutedForeground, fontWeight: "700" });
  });

  it("lists each group's places under it", async () => {
    await renderGroups();
    expect(screen.getByRole("button", { name: "Companies" })).toBeTruthy();
    expect(screen.getAllByRole("link").map((link) => within(link).getByText(/./).props.children)).toEqual([
      "Security",
      "Support MyFreeApps",
    ]);
  });

  it("opens the app's screen for a place it has and the website for the rest", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderGroups();
    await fireEvent.press(screen.getByRole("button", { name: "Companies" }));
    expect(router.push).toHaveBeenCalledWith("/companies");
    await fireEvent.press(screen.getByRole("link", { name: "Security" }));
    expect(open).toHaveBeenCalledWith("https://web.test/security");
  });
});
