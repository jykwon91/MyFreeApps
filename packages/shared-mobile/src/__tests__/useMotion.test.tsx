import { act, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AccessibilityInfo, Text } from "react-native";
import FormSheet from "../components/FormSheet";
import OptionSheet from "../components/OptionSheet";
import TwoStepTurnOffSheet from "../components/TwoStepTurnOffSheet";
import { useMotion } from "../hooks/useMotion";

const mockModalAnimations: (string | undefined)[] = [];
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ animationType, visible, children }: { animationType?: string; visible: boolean; children: unknown }) => {
    mockModalAnimations.push(animationType);
    return visible ? children : null;
  },
}));

const mockScrollTo = jest.fn();
jest.mock("../components/KeyboardAwareScroll", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: forwardRef(({ children }: { children: ReactNode }, ref) => {
      useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      return children;
    }),
  };
});

function setReduceMotion(isOn: boolean): void {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(isOn);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
}

function lastAnimation(): string | undefined {
  return mockModalAnimations.at(-1);
}

beforeEach(() => {
  mockModalAnimations.length = 0;
  mockScrollTo.mockClear();
});

describe("useMotion", () => {
  it("animates once Reduce Motion is known to be off", async () => {
    setReduceMotion(false);
    const { result } = await renderHook(() => useMotion());
    await waitFor(() => expect(result.current).toEqual({ isAnimated: true, sheetAnimation: "slide" }));
  });

  it("stays still while the setting is unknown", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
    const { result } = await renderHook(() => useMotion());
    expect(result.current).toEqual({ isAnimated: false, sheetAnimation: "none" });
  });

  it("stays still with Reduce Motion on", async () => {
    setReduceMotion(true);
    const { result } = await renderHook(() => useMotion());
    await act(async () => {});
    expect(result.current).toEqual({ isAnimated: false, sheetAnimation: "none" });
  });
});

describe.each([
  [true, "none", false],
  [false, "slide", true],
])("sheets with Reduce Motion %s", (reduceMotion, animation, isAnimated) => {
  beforeEach(() => setReduceMotion(reduceMotion));

  it(`FormSheet uses "${animation}" and scrolls to its failure ${isAnimated ? "animated" : "without animating"}`, async () => {
    await render(
      <FormSheet failure="Could not save" isOpen onRequestClose={jest.fn()} title="Add a charge">
        <Text>Amount</Text>
      </FormSheet>,
    );
    await waitFor(() => expect(lastAnimation()).toBe(animation));
    await waitFor(() => expect(mockScrollTo).toHaveBeenLastCalledWith({ y: 0, animated: isAnimated }));
  });

  it(`OptionSheet uses "${animation}"`, async () => {
    await render(<OptionSheet isOpen onClose={jest.fn()} onSelect={jest.fn()} options={[{ value: "a", label: "A" }]} title="Pick" value="a" />);
    await waitFor(() => expect(lastAnimation()).toBe(animation));
  });

  it(`TwoStepTurnOffSheet uses "${animation}"`, async () => {
    await render(<TwoStepTurnOffSheet onClose={jest.fn()} onSettled={jest.fn()} />);
    await waitFor(() => expect(lastAnimation()).toBe(animation));
    expect(screen.toJSON()).not.toBeNull();
  });
});
