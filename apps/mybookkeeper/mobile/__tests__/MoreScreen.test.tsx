import { KEYBOARD_FIELD_CLEARANCE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text as MockText } from "react-native";
import { MORE_MENU } from "../src/constants/moreMenu";
import { MORE_SEARCH_MESSAGES } from "../src/constants/moreSearch";
import MoreScreen from "../src/features/more/MoreScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0" } }));
jest.mock("@platform/mobile", () => {
  return {
    ...jest.requireActual("@platform/mobile"),
    AccountSettings: () => <MockText>Account section</MockText>,
  };
});
jest.mock("../src/features/workspace/useIsAdmin", () => ({ useIsAdmin: jest.fn() }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);

const field = () => screen.getByLabelText(MORE_SEARCH_MESSAGES.label);

async function show(role: "admin" | "member" | "readOnly" = "admin"): Promise<void> {
  jest.mocked(useIsAdmin).mockReturnValue(role === "admin");
  jest.mocked(useCanWrite).mockReturnValue(role !== "readOnly");
  await render(
    <ToastProvider bottomOffset={0}>
      <MoreScreen />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MoreScreen search", () => {
  it("shows the grouped menu, account section and version until something is typed", async () => {
    await show();
    expect(screen.getByText(MORE_MENU[0].title)).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("Account section")).toBeTruthy();
    expect(screen.getByText("Version 1.0.0")).toBeTruthy();
    expect(screen.queryByText(/results?$/)).toBeNull();
  });

  it("filters as you type, with the group as secondary text and a polite count", async () => {
    await show();
    await fireEvent.changeText(field(), "rent");
    expect(screen.getByText("Rent Receipts")).toBeTruthy();
    expect(screen.getByText("Leases")).toBeTruthy();
    expect(screen.getAllByText("Leasing").length).toBeGreaterThan(0);
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.getByText(/^\d+ results?$/).props.accessibilityLiveRegion).toBe("polite");
  });

  it("hides the account section and version while searching, and brings them back", async () => {
    await show();
    await fireEvent.changeText(field(), "rent");
    expect(screen.queryByText("Account section")).toBeNull();
    expect(screen.queryByText("Version 1.0.0")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Clear search"));
    expect(screen.getByText("Account section")).toBeTruthy();
    expect(screen.getByText("Version 1.0.0")).toBeTruthy();
  });

  it("finds a keyword and a tab destination", async () => {
    await show();
    await fireEvent.changeText(field(), "schedule e");
    expect(screen.getByText("Tax Report")).toBeTruthy();
    await fireEvent.changeText(field(), "inquiries");
    expect(screen.getByText("Inquiries")).toBeTruthy();
  });

  it("says nothing matches, with what was typed", async () => {
    await show();
    await fireEvent.changeText(field(), "zzzz");
    expect(screen.getByText('Nothing matches "zzzz"')).toBeTruthy();
    expect(screen.getByText("0 results")).toBeTruthy();
  });

  it("clears back to the grouped menu", async () => {
    await show();
    await fireEvent.changeText(field(), "zzzz");
    await fireEvent.press(screen.getByLabelText("Clear search"));
    expect(field().props.value).toBe("");
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it("hides admin-only screens from members, in the menu and in search", async () => {
    await show("member");
    expect(screen.queryByText("Members")).toBeNull();
    await fireEvent.changeText(field(), "members");
    expect(screen.queryByText("Members")).toBeNull();
    expect(screen.getByText('Nothing matches "members"')).toBeTruthy();
  });

  it("shows admin-only screens to admins in search", async () => {
    await show("admin");
    await fireEvent.changeText(field(), "invite");
    expect(screen.getByText("Members")).toBeTruthy();
  });

  it("offers a member who can write the screens that add things", async () => {
    await show("member");
    await fireEvent.changeText(field(), "import");
    expect(screen.getByText("Import bank transactions")).toBeTruthy();
    expect(screen.getByText("Import a lease")).toBeTruthy();
  });

  it("hides the screens that add things from a read-only member, but not the ones they can read", async () => {
    await show("readOnly");
    await fireEvent.changeText(field(), "import");
    expect(screen.queryByText("Import bank transactions")).toBeNull();
    expect(screen.queryByText("Import a lease")).toBeNull();
    await fireEvent.changeText(field(), "new");
    expect(screen.queryByText("New lease")).toBeNull();
    expect(screen.queryByText("Add a transaction")).toBeNull();
    await fireEvent.changeText(field(), "duplicates");
    expect(screen.getByText("Duplicates")).toBeTruthy();
  });

  it("opens the screen for a tapped result", async () => {
    await show();
    await fireEvent.changeText(field(), "duplicates");
    await fireEvent.press(screen.getByRole("button", { name: "Duplicates, Money" }));
    expect(mockPush).toHaveBeenCalledWith("/duplicates");
  });

  it("finds sign out, log out and devices, and a tap shows the account section", async () => {
    await show("readOnly");
    for (const query of ["sign out", "log out", "devices"]) {
      await fireEvent.changeText(field(), query);
      expect(screen.getByText("Sign out and devices")).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole("button", { name: "Sign out and devices, Account" }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(field().props.value).toBe("");
    expect(screen.getByText("Account section")).toBeTruthy();
  });

  it("tells a screen reader the count once typing pauses", async () => {
    jest.useFakeTimers();
    try {
      await show();
      await fireEvent.changeText(field(), "r");
      await fireEvent.changeText(field(), "rent");
      expect(announce).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^\d+ results?$/));
    } finally {
      jest.useRealTimers();
    }
  });

  it("dismisses the keyboard on scroll, keeps taps working, and keeps the search field in view", async () => {
    await show();
    const scroll = screen.getByTestId("more-scroll");
    expect(scroll.props.keyboardDismissMode).toBe("on-drag");
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
    // The keyboard-aware scroll view, which keeps the field clear of the keyboard on Android as well as iOS.
    expect(scroll.props.bottomOffset).toBe(KEYBOARD_FIELD_CLEARANCE);
    expect(scroll.props.stickyHeaderIndices).toEqual([0]);
  });
});
