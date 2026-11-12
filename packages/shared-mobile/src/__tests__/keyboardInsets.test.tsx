import { render, screen, waitFor } from "@testing-library/react-native";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { Text } from "react-native";
import { SessionContext } from "../auth/SessionContext";
import DeleteAccountScreen from "../components/DeleteAccountScreen";
import FormSheet from "../components/FormSheet";
import SignInScreen from "../components/SignInScreen";
import ToastProvider from "../components/ToastProvider";
import TwoStepTurnOffSheet from "../components/TwoStepTurnOffSheet";
import TwoStepTurnOnScreen from "../components/TwoStepTurnOnScreen";
import { KEYBOARD_FIELD_CLEARANCE } from "../constants/keyboard";
import { keyboardHandlingProblems } from "../../test-support/keyboardHandlingProblems";
import { nodesOfType } from "../../test-support/renderedNodes";
import type { RenderedNode } from "../../test-support/types/RenderedNode";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("../auth/mobileAuthApi", () => ({ fetchTwoFactorEnabled: jest.fn().mockResolvedValue(false) }));

const SIGNED_OUT: SessionState = { status: "signedOut", endedByServer: false, lastEmail: null };
const SIGNED_IN: SessionState = { status: "signedIn", email: "me@example.com", sessionId: "mine" };
const session = {
  getState: () => SIGNED_OUT,
  subscribe: () => () => {},
} as unknown as MobileSession;
const signedInSession = { getState: () => SIGNED_IN, subscribe: () => () => {} } as unknown as MobileSession;

// Android draws edge to edge, so its window no longer shrinks for the keyboard, and automaticallyAdjustKeyboardInsets
// only works on iOS: the fields at the bottom stayed under the keyboard. KeyboardAwareScroll pads and scrolls on both,
// by where the field is on the screen, so a page sheet or a header above needs no offset. Under Jest it renders the
// library's mock, a ScrollView given the props, so the clearance only it sets shows which scroll view rendered.
function expectsScrollViewToTrackKeyboard(): void {
  const tree = screen.toJSON() as RenderedNode | null;
  const [outermost] = nodesOfType(tree, "RCTScrollView");
  expect(outermost).toBeDefined();
  expect(outermost.props.bottomOffset).toBe(KEYBOARD_FIELD_CLEARANCE);
  expect(outermost.props.automaticallyAdjustKeyboardInsets).toBeUndefined();
}

describe("keyboard insets", () => {
  it("FormSheet lets its scroll view track the keyboard", async () => {
    await render(
      <FormSheet isOpen onRequestClose={jest.fn()} title="Add a charge">
        <Text>Amount field</Text>
      </FormSheet>,
    );
    expectsScrollViewToTrackKeyboard();
  });

  it("the turn-off sheet lets its scroll view track the keyboard", async () => {
    await render(
      <ToastProvider bottomOffset={0}>
        <TwoStepTurnOffSheet onClose={jest.fn()} onSettled={jest.fn()} />
      </ToastProvider>,
    );
    expectsScrollViewToTrackKeyboard();
  });

  it("the sign-in screen lets its scroll view track the keyboard", async () => {
    await render(
      <SessionContext.Provider value={session}>
        <SignInScreen appName="MyRecipes" onSignedIn={jest.fn()} webBaseUrl="https://web.test" />
      </SessionContext.Provider>,
    );
    expectsScrollViewToTrackKeyboard();
  });

  it("the delete-account screen lets its scroll view track the keyboard", async () => {
    await render(
      <SessionContext.Provider value={signedInSession}>
        <DeleteAccountScreen warning="This deletes your recipes." />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(screen.queryByTestId("two-factor-skeleton")).toBeNull());
    expectsScrollViewToTrackKeyboard();
  });

  it("the turn-on screen lets its scroll view track the keyboard", async () => {
    await render(
      <ToastProvider bottomOffset={0}>
        <TwoStepTurnOnScreen appName="MyBookkeeper" onFinished={jest.fn()} onLeaveRiskChange={jest.fn()} />
      </ToastProvider>,
    );
    expectsScrollViewToTrackKeyboard();
  });

  it("nothing in the shared package leaves a field under the keyboard on Android", () => {
    expect(keyboardHandlingProblems(join(__dirname, "..", ".."), ["src"])).toEqual([]);
  });

  it("the check catches each way a field could end up under the keyboard again", () => {
    const root = mkdtempSync(join(tmpdir(), "keyboard-check-"));
    const write = (name: string, code: string) => writeFileSync(join(root, "src", name), code);
    try {
      mkdirSync(join(root, "src", "bars"), { recursive: true });
      write("IosOnly.tsx", "export default () => <ScrollView automaticallyAdjustKeyboardInsets />;");
      write("RawAvoiding.tsx", 'import { KeyboardAvoidingView, View } from "react-native";');
      write("NavBar.ts", 'Keyboard.addListener("keyboardDidShow", (event) => event.endCoordinates.height);');
      write("Sheet.tsx", "export default () => <Modal visible><ScrollView><FormField label=\"Name\" /></ScrollView></Modal>;");
      write("NamespaceAvoiding.tsx", 'import * as RN from "react-native";\nexport default () => <RN.KeyboardAvoidingView />;');
      write("NamedOnly.tsx", 'import { KeyboardAwareScroll } from "@platform/mobile";\nexport default () => <Modal visible><ScrollView><TextInput /></ScrollView></Modal>;');
      // A "//" inside a string mustn't hide the rest of its line.
      write("CommentInString.tsx", 'const label = "a // b"; export default () => <ScrollView automaticallyAdjustKeyboardInsets />;');
      // A bar padded for the home indicator inside the avoiding view, however the inset is read.
      write("FloatingBar.tsx", 'const { bottom } = useSafeAreaInsets();\nexport default () => <HeaderKeyboardAvoidingView><View style={{ paddingBottom: bottom }} /></HeaderKeyboardAvoidingView>;');
      write("FloatingBarInsets.tsx", 'const insets = useSafeAreaInsets();\nexport default () => <HeaderKeyboardAvoidingView><View style={{ paddingBottom: insets.bottom }} /></HeaderKeyboardAvoidingView>;');
      write("FloatingBarInline.tsx", "export default () => <HeaderKeyboardAvoidingView><View style={{ paddingBottom: useSafeAreaInsets().bottom }} /></HeaderKeyboardAvoidingView>;");
      // The top inset has nothing to do with the keyboard.
      write("TopOnly.tsx", 'const insets = useSafeAreaInsets();\nconst { top } = useSafeAreaInsets();\nexport default () => <HeaderKeyboardAvoidingView><View style={{ paddingTop: insets.top + top }} /></HeaderKeyboardAvoidingView>;');
      // A bar in its own file, rendered in another file's avoiding view: the bar is the problem.
      write("BarScreen.tsx", 'import Bar from "./Bar";\nexport default () => <HeaderKeyboardAvoidingView><Bar /></HeaderKeyboardAvoidingView>;');
      write("Bar.tsx", 'export default function Bar() {\n  const insets = useSafeAreaInsets();\n  return <View style={{ paddingBottom: insets.bottom }} />;\n}');
      // Rendered outside an avoiding view, a bottom inset is fine.
      write("TabScreen.tsx", 'import TabFooter from "./TabFooter";\nexport default () => <View><TabFooter /></View>;');
      write("TabFooter.tsx", 'export default function TabFooter() {\n  return <View style={{ paddingBottom: useSafeAreaInsets().bottom }} />;\n}');
      write("Fine.tsx", "// automaticallyAdjustKeyboardInsets, mentioned only in a comment\nexport default () => <Modal visible><KeyboardAwareScroll><FormField /></KeyboardAwareScroll></Modal>;");
      // Only the shared HeaderKeyboardAvoidingView may use one, even the keyboard controller's.
      write("LibraryAvoiding.tsx", 'import { KeyboardAvoidingView } from "react-native-keyboard-controller";\nexport default () => <KeyboardAvoidingView behavior="padding" />;');
      // Scroll content padded for the home indicator scrolls clear of the keyboard with the rest.
      write("ScrollPadded.tsx", 'const { bottom: inset } = useSafeAreaInsets();\nexport default () => <HeaderKeyboardAvoidingView><KeyboardAwareScroll contentContainerStyle={{ paddingBottom: inset + 16 }} /></HeaderKeyboardAvoidingView>;');
      write("ListPadded.tsx", 'const insets = useSafeAreaInsets();\nexport default () => <HeaderKeyboardAvoidingView><FlatList data={[]} contentContainerStyle={[styles.list, { paddingBottom: insets.bottom }]} /></HeaderKeyboardAvoidingView>;');
      // ...but not a bar beside it.
      write("ScrollAndBar.tsx", 'const { bottom } = useSafeAreaInsets();\nexport default () => <HeaderKeyboardAvoidingView><ScrollView contentContainerStyle={{ paddingBottom: bottom }} /><View style={{ paddingBottom: bottom }} /></HeaderKeyboardAvoidingView>;');
      // A horizontal scroll view is a row in a bar, not the form's content.
      write("ChipBar.tsx", 'const insets = useSafeAreaInsets();\nexport default () => <HeaderKeyboardAvoidingView><ScrollView /><View><ScrollView horizontal contentContainerStyle={{ paddingBottom: insets.bottom }} /></View></HeaderKeyboardAvoidingView>;');
      // A SafeAreaView pads the bottom edge unless its edges leave it out.
      write("SafeAreaScreen.tsx", "export default () => <HeaderKeyboardAvoidingView><SafeAreaView style={{ flex: 1 }} /></HeaderKeyboardAvoidingView>;");
      write("SafeAreaTopOnly.tsx", 'export default () => <HeaderKeyboardAvoidingView><SafeAreaView edges={["top", "left", "right"]} /><SafeAreaView edges={{ top: "additive", bottom: "off" }} /></HeaderKeyboardAvoidingView>;');
      write("SafeAreaBarScreen.tsx", 'import SafeAreaBar from "./SafeAreaBar";\nexport default () => <HeaderKeyboardAvoidingView><SafeAreaBar /></HeaderKeyboardAvoidingView>;');
      write("SafeAreaBar.tsx", 'export default function SafeAreaBar() {\n  return <SafeAreaView edges={["bottom"]} />;\n}');
      // Outside an avoiding view, a SafeAreaView is fine.
      write("SafeAreaSheet.tsx", "export default () => <Modal visible><SafeAreaView style={{ flex: 1 }} /></Modal>;");
      // A bar reached through a barrel's named re-export, with single quotes.
      write("BarrelScreen.tsx", "import { FooterBar } from './bars';\nexport default () => <HeaderKeyboardAvoidingView><FooterBar /></HeaderKeyboardAvoidingView>;");
      write("bars/index.ts", "export { default as FooterBar } from './FooterBar';\nexport { default as IdleBar } from \"./IdleBar\";");
      write("bars/FooterBar.tsx", "export default function FooterBar() {\n  return <View style={{ paddingBottom: useSafeAreaInsets().bottom }} />;\n}");
      // Exported by the barrel but not rendered in the avoiding view.
      write("bars/IdleBar.tsx", "export default function IdleBar() {\n  return <View style={{ paddingBottom: useSafeAreaInsets().bottom }} />;\n}");
      write("QuotedScreen.tsx", "import QuotedBar from './QuotedBar';\nexport default () => <HeaderKeyboardAvoidingView><QuotedBar /></HeaderKeyboardAvoidingView>;");
      write("QuotedBar.tsx", "export default function QuotedBar() {\n  return <View style={{ paddingBottom: useSafeAreaInsets().bottom }} />;\n}");
      // The shared PinnedBar pads for the home indicator by design: it lets go of it as the keyboard opens.
      const pinnedBar = relative(join(root, "src"), join(__dirname, "..", "components", "PinnedBar"));
      write("PinnedScreen.tsx", `import PinnedBar from "${pinnedBar}";\nexport default () => <HeaderKeyboardAvoidingView><PinnedBar bottomSpacing={8} /></HeaderKeyboardAvoidingView>;`);
      write("SlashesInString.tsx", 'export const hint = "a // b /* c */ automaticallyAdjust" + "KeyboardInsets";');
      expect(keyboardHandlingProblems(root, ["src"]).map((problem) => problem.split(":")[0]).sort()).toEqual([
        "src/Bar.tsx",
        "src/ChipBar.tsx",
        "src/CommentInString.tsx",
        "src/FloatingBar.tsx",
        "src/FloatingBarInline.tsx",
        "src/FloatingBarInsets.tsx",
        "src/IosOnly.tsx",
        "src/LibraryAvoiding.tsx",
        "src/NamedOnly.tsx",
        "src/NamespaceAvoiding.tsx",
        "src/NavBar.ts",
        "src/QuotedBar.tsx",
        "src/RawAvoiding.tsx",
        "src/SafeAreaBar.tsx",
        "src/SafeAreaScreen.tsx",
        "src/ScrollAndBar.tsx",
        "src/Sheet.tsx",
        "src/bars/FooterBar.tsx",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
