import { render, screen } from "@testing-library/react-native";
import { Appearance, Text } from "react-native";
import RootProviders from "../components/RootProviders";
import { THEME_PREFERENCE_KEY } from "../constants/themePreference";
import { useTheme } from "../theme/useTheme";
import { storedItems } from "../../test-support/memorySecureStore";
import { useSession } from "../hooks/useSession";
import { nodesOfType } from "../../test-support/renderedNodes";
import type { RenderedNode } from "../../test-support/types/RenderedNode";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

jest.mock("expo-secure-store", () => jest.requireActual("../../test-support/memorySecureStore"));
jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => undefined);

const SIGNED_IN: SessionState = { status: "signedIn", email: "me@example.com", sessionId: "mine" };

function Scheme() {
  return <Text>{useTheme().isDark ? "dark" : "light"}</Text>;
}

function Status() {
  return <Text>{useSession().state.status}</Text>;
}

describe("RootProviders", () => {
  // The keyboard-aware scroll view, the header's keyboard-avoiding view and the toast all read the keyboard from
  // this provider; without it they don't move on Android. One at the root also covers every Modal.
  it("tracks the keyboard around the whole app and starts the session inside it", async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const session = { getState: () => SIGNED_IN, subscribe: () => () => {}, start } as unknown as MobileSession;
    await render(
      <RootProviders session={session}>
        <Status />
      </RootProviders>,
    );
    const [outermost] = nodesOfType(screen.toJSON() as RenderedNode | null, "KeyboardProvider");
    expect(outermost).toBeDefined();
    expect(nodesOfType(outermost, "Text").map((node) => node.children)).toEqual([["signedIn"]]);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("puts back the theme chosen on this phone before", async () => {
    storedItems.set(THEME_PREFERENCE_KEY, "dark");
    const session = { getState: () => SIGNED_IN, subscribe: () => () => {}, start: jest.fn() } as unknown as MobileSession;
    await render(
      <RootProviders session={session}>
        <Scheme />
      </RootProviders>,
    );
    expect(await screen.findByText("dark")).toBeTruthy();
  });
});
