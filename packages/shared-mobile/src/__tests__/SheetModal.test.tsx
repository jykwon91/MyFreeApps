import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AccessibilityInfo, Platform, Text } from "react-native";
import { requestTwoStepDisable } from "../auth/twoStepApi";
import OptionSheet from "../components/OptionSheet";
import SheetModal from "../components/SheetModal";
import TwoStepTurnOffSheet from "../components/TwoStepTurnOffSheet";
import { SHEET_MODAL_ROOT_TEST_ID } from "../constants/sheetModal";
import { TWO_STEP_MESSAGES } from "../constants/twoStep";
import type { TwoStepDisableResult } from "../types/TwoStepDisableResult";
import { sheetEscapeProblems } from "../../test-support/sheetEscapeProblems";

jest.mock("../auth/twoStepApi");

const mockModal: { animationType?: string; onDismiss?: () => void } = {};
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ animationType, onDismiss, visible, children }: { animationType?: string; onDismiss?: () => void; visible: boolean; children: unknown }) => {
    mockModal.animationType = animationType;
    mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));

const disable = jest.mocked(requestTwoStepDisable);

function setReduceMotion(isOn: boolean): void {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(isOn);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
}

/** VoiceOver's two-finger scrub, sent to the sheet's outermost view. */
async function escape(): Promise<void> {
  await fireEvent(screen.getByTestId(SHEET_MODAL_ROOT_TEST_ID), "accessibilityEscape");
}

describe("SheetModal", () => {
  it("asks to close when a screen reader user makes the escape gesture", async () => {
    const onRequestClose = jest.fn();
    await render(
      <SheetModal isOpen onRequestClose={onRequestClose}>
        <Text>Body</Text>
      </SheetModal>,
    );

    await escape();

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("shows nothing while closed", async () => {
    await render(
      <SheetModal isOpen={false} onRequestClose={jest.fn()}>
        <Text>Body</Text>
      </SheetModal>,
    );
    expect(screen.queryByText("Body")).toBeNull();
  });

  it.each([
    [true, "none"],
    [false, "slide"],
  ])("with Reduce Motion %s it uses %s", async (reduceMotion, animation) => {
    setReduceMotion(reduceMotion);
    await render(
      <SheetModal isOpen onRequestClose={jest.fn()}>
        <Text>Body</Text>
      </SheetModal>,
    );
    await waitFor(() => expect(mockModal.animationType).toBe(animation));
  });

  describe("telling its owner it has finished closing", () => {
    const os = Platform.OS;
    afterEach(() => {
      Platform.OS = os;
    });

    it("on iOS, once the Modal says it's gone", async () => {
      Platform.OS = "ios";
      const onClosed = jest.fn();
      await render(
        <SheetModal isOpen onClosed={onClosed} onRequestClose={jest.fn()}>
          <Text>Body</Text>
        </SheetModal>,
      );
      expect(mockModal.onDismiss).toBe(onClosed);
    });

    it("on Android, as soon as it's shut, and only then", async () => {
      Platform.OS = "android";
      const onClosed = jest.fn();
      const sheet = (isOpen: boolean) => (
        <SheetModal isOpen={isOpen} onClosed={onClosed} onRequestClose={jest.fn()}>
          <Text>Body</Text>
        </SheetModal>
      );
      await render(sheet(true));
      expect(onClosed).not.toHaveBeenCalled();
      await screen.rerender(sheet(false));
      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(mockModal.onDismiss).toBeUndefined();
    });
  });
});

describe("the shared sheets close on the escape gesture", () => {
  it("OptionSheet closes", async () => {
    const onClose = jest.fn();
    await render(<OptionSheet isOpen onClose={onClose} onSelect={jest.fn()} options={[{ value: "a", label: "A" }]} title="Pick" value="a" />);
    await escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("TwoStepTurnOffSheet closes, but not while it's turning two-step off", async () => {
    let settle: (result: TwoStepDisableResult) => void = () => undefined;
    disable.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const onClose = jest.fn();
    await render(<TwoStepTurnOffSheet onClose={onClose} onSettled={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText(TWO_STEP_MESSAGES.turnOffCodeLabel), "123456");
    await fireEvent.press(screen.getByRole("button", { name: TWO_STEP_MESSAGES.confirmTurnOff }));
    await escape();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => settle("wrong_code"));
    await escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("sheetEscapeProblems", () => {
  it("finds no Modal in the shared package that ignores the escape gesture", () => {
    expect(sheetEscapeProblems(join(__dirname, "..", ".."), ["src"])).toEqual([]);
  });

  it("catches each react-native Modal that ignores the escape gesture, one Modal at a time", () => {
    const root = mkdtempSync(join(tmpdir(), "sheet-escape-check-"));
    const write = (name: string, code: string) => writeFileSync(join(root, "src", name), code);
    const RN = 'import { Modal, View } from "react-native";\n';
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      write("HandRolled.tsx", `${RN}export default () => <Modal presentationStyle="pageSheet" visible><View onAccessibilityEscape={close} /></Modal>;`);
      write("FormSheetStyle.tsx", `${RN}export default () => <Modal presentationStyle={"formSheet"} visible><View onAccessibilityEscape={close} /></Modal>;`);
      write("FullScreenStyle.tsx", `${RN}export default () => <Modal presentationStyle="fullScreen" visible><View /></Modal>;`);
      write("FullScreenEscaping.tsx", `${RN}export default () => <Modal presentationStyle="overFullScreen" visible><View onAccessibilityEscape={close} /></Modal>;`);
      write("Viewer.tsx", `${RN}export default () => <Modal animationType="fade" visible><View /></Modal>;`);
      write("SelfClosing.tsx", `${RN}export default () => <Modal visible />;`);
      write("EscapingViewer.tsx", `${RN}export default () => <Modal animationType="fade" visible><View><View onAccessibilityEscape={close} /></View></Modal>;`);
      // One Modal's handler doesn't close another, and neither does one outside the Modal.
      write("TwoModals.tsx", `${RN}export default () => <View><Modal visible><View onAccessibilityEscape={close} /></Modal>\n<Modal visible><View /></Modal></View>;`);
      write("HandlerOutside.tsx", `${RN}export default () => <View onAccessibilityEscape={close}>\n<Modal visible><View /></Modal></View>;`);
      // react-native's Modal under another name.
      write("Aliased.tsx", 'import { Modal as RNModal, View } from "react-native";\nexport default () => <RNModal visible><View /></RNModal>;');
      write("Namespace.tsx", 'import * as RN from "react-native";\nexport default () => <RN.Modal visible><RN.View /></RN.Modal>;');
      // Somebody else's Modal isn't react-native's.
      write("ThirdParty.tsx", 'import Modal from "react-native-modal";\nimport { View } from "react-native";\nexport default () => <Modal isVisible><View /></Modal>;');
      write("Sheet.tsx", "export default () => <SheetModal isOpen onRequestClose={close}><View /></SheetModal>;");
      const escape = "a full-screen Modal must close on the screen reader's escape gesture: set onAccessibilityEscape on its root view";
      const pageSheet = "a page sheet must be a SheetModal, which closes on the screen reader's escape gesture";
      expect(sheetEscapeProblems(root, ["src"]).sort()).toEqual([
        `src/Aliased.tsx:2: ${escape}`,
        `src/FormSheetStyle.tsx:2: ${pageSheet}`,
        `src/FullScreenStyle.tsx:2: ${escape}`,
        `src/HandRolled.tsx:2: ${pageSheet}`,
        `src/HandlerOutside.tsx:3: ${escape}`,
        `src/Namespace.tsx:2: ${escape}`,
        `src/SelfClosing.tsx:2: ${escape}`,
        `src/TwoModals.tsx:3: ${escape}`,
        `src/Viewer.tsx:2: ${escape}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
