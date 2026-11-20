import { fireEvent, render, screen } from "@testing-library/react-native";
import PropertyMultiSheet from "../src/features/analyticsControls/PropertyMultiSheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const PROPERTIES = [
  { id: "p1", name: "Maple House" },
  { id: "p2", name: "Oak Cottage" },
  { id: "p3", name: "Pine Loft" },
];

async function showSheet(selectedIds: string[], onChange = jest.fn()): Promise<jest.Mock> {
  await render(<PropertyMultiSheet isOpen maxSelected={2} onChange={onChange} onClose={jest.fn()} properties={PROPERTIES} selectedIds={selectedIds} />);
  return onChange;
}

describe("PropertyMultiSheet at the property limit", () => {
  it("reads unchosen rows as disabled, keeps chosen rows usable, and ignores taps on the disabled ones", async () => {
    const onChange = await showSheet(["p1", "p2"]);
    expect(screen.getByRole("checkbox", { name: "Pine Loft" }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole("checkbox", { name: "Maple House" }).props.accessibilityState.disabled).toBeFalsy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Pine Loft" }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Maple House" }));
    expect(onChange).toHaveBeenCalledWith(["p2"]);
  });

  it("leaves every row usable below the limit", async () => {
    const onChange = await showSheet(["p1"]);
    expect(screen.getByRole("checkbox", { name: "Pine Loft" }).props.accessibilityState.disabled).toBeFalsy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Pine Loft" }));
    expect(onChange).toHaveBeenCalledWith(["p1", "p3"]);
  });
});
