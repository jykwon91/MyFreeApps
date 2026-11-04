import { Ionicons } from "@expo/vector-icons";
import { render } from "@testing-library/react-native";
import { newInquiryBadge, peopleTabLabel } from "../src/features/inquiries/newInquiryBadge";
import { tabBarIcon } from "../src/features/shell/tabBarIcon";

jest.mock("@expo/vector-icons", () => ({ Ionicons: jest.fn(() => null) }));

describe("tabBarIcon", () => {
  const nameFor = async (focused: boolean) => {
    const Icon = tabBarIcon("home", "home-outline");
    jest.mocked(Ionicons).mockClear();
    await render(<Icon color="red" focused={focused} size={24} />);
    return jest.mocked(Ionicons).mock.calls[0][0];
  };

  it("fills in when selected and passes on the tab bar's colour and size", async () => {
    expect(await nameFor(true)).toMatchObject({ name: "home", size: 24, style: { color: "red" } });
    expect((await nameFor(false)).name).toBe("home-outline");
  });
});

describe("the People tab", () => {
  it.each([
    [0, undefined, "People"],
    [1, 1, "People, 1 new inquiry"],
    [99, 99, "People, 99 new inquiries"],
    [100, "99+", "People, more than 99 new inquiries"],
  ])("with %i new", (count, badge, label) => {
    expect(newInquiryBadge(count)).toBe(badge);
    expect(peopleTabLabel(count)).toBe(label);
  });
});
