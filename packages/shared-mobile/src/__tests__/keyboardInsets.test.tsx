import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { SessionContext } from "../auth/SessionContext";
import DeleteAccountScreen from "../components/DeleteAccountScreen";
import FormSheet from "../components/FormSheet";
import SignInScreen from "../components/SignInScreen";
import ToastProvider from "../components/ToastProvider";
import TwoStepTurnOffSheet from "../components/TwoStepTurnOffSheet";
import TwoStepTurnOnScreen from "../components/TwoStepTurnOnScreen";
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

// KeyboardAvoidingView pads by comparing the view's position in its parent with the keyboard's position on the
// screen. A page sheet or a screen under a header sits lower on the screen than in its parent, so the padding
// came up short by that gap and the last fields stayed under the keyboard. The scroll view measures itself
// natively instead, so it needs no offset.
function expectsScrollViewToTrackKeyboard(): void {
  const tree = screen.toJSON() as RenderedNode | null;
  const [outermost] = nodesOfType(tree, "RCTScrollView");
  expect(outermost).toBeDefined();
  expect(outermost.props.automaticallyAdjustKeyboardInsets).toBe(true);
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
});
