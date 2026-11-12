import { act, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import { useScreenFocused } from "../hooks/useScreenFocused";

function WatchedScreen() {
  return <Text testID="watched">{useScreenFocused() ? "focused" : "unfocused"}</Text>;
}

const routes = {
  _layout: () => <Stack />,
  index: () => <WatchedScreen />,
  other: () => <Text>other-screen</Text>,
};

it("is true while the screen shows, false under another, and true again on the way back", async () => {
  await renderRouter(routes, { initialUrl: "/" });
  expect(screen.getByTestId("watched")).toHaveTextContent(/^focused$/);

  await act(async () => router.push("/other"));
  expect(screen.getByTestId("watched", { includeHiddenElements: true })).toHaveTextContent(/^unfocused$/);

  await act(async () => router.back());
  expect(screen.getByTestId("watched")).toHaveTextContent(/^focused$/);
});
