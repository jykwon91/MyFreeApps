import { act, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import type { ReactTestRendererJSON } from "react-test-renderer";
import DeleteAccountRoute from "../app/(app)/delete-account";
import {
  DELETE_ACCOUNT_BACK_TITLE,
  DELETE_ACCOUNT_BACK_TITLE_FROM_SECURITY,
  DELETE_ACCOUNT_FROM_SECURITY,
  DELETE_ACCOUNT_TITLE,
} from "../src/constants/deleteAccount";
import { DELETE_ACCOUNT_ROUTE } from "../src/constants/security";

// The screen itself is the shared one, tested there. This is only about the header.
jest.mock("@platform/mobile", () => ({ DeleteAccountScreen: () => null }));

function headerTitled(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null, title: string): Record<string, unknown> | undefined {
  if (!node) return undefined;
  if (Array.isArray(node)) return node.map((child) => headerTitled(child, title)).find(Boolean);
  if (node.type === "RNSScreenStackHeaderConfig" && node.props.title === title) return node.props;
  return headerTitled((node.children ?? []).filter((child): child is ReactTestRendererJSON => typeof child !== "string"), title);
}

/** Opens Delete account over a screen titled "Home", as the app's tabs are, so a missing back title would show "Home". */
async function backTitleWhenOpenedWith(params: Record<string, string>): Promise<unknown> {
  await renderRouter(
    {
      _layout: () => (
        <Stack>
          <Stack.Screen name="index" options={{ title: "Home" }} />
        </Stack>
      ),
      index: () => null,
      "delete-account": DeleteAccountRoute,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push({ pathname: DELETE_ACCOUNT_ROUTE, params });
  });
  return headerTitled(screen.toJSON(), DELETE_ACCOUNT_TITLE)?.backTitle;
}

describe("Delete account back title", () => {
  it("names More when opened from More or its search", async () => {
    expect(await backTitleWhenOpenedWith({})).toBe(DELETE_ACCOUNT_BACK_TITLE);
  });

  it("names Security when opened from Security", async () => {
    expect(await backTitleWhenOpenedWith({ from: DELETE_ACCOUNT_FROM_SECURITY })).toBe(DELETE_ACCOUNT_BACK_TITLE_FROM_SECURITY);
  });
});
