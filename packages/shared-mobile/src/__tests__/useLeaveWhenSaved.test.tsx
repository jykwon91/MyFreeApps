import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Pressable, Text } from "react-native";
import { useLeaveWhenSaved } from "../hooks/useLeaveWhenSaved";

function SavedScreen() {
  const { isLeaving, leave } = useLeaveWhenSaved("/list");
  return (
    <Pressable accessibilityRole="button" onPress={leave}>
      <Text>{isLeaving ? "leaving" : "saved-screen"}</Text>
    </Pressable>
  );
}

const routes = {
  _layout: () => <Stack />,
  index: () => <Text>previous-screen</Text>,
  list: () => <Text>list-screen</Text>,
  saved: () => <SavedScreen />,
};

it("goes back once saved", async () => {
  await renderRouter(routes, { initialUrl: "/" });
  await act(async () => router.push("/saved"));
  await fireEvent.press(screen.getByRole("button"));
  expect(screen.getByText("previous-screen")).toBeTruthy();
  expect(screen).toHavePathname("/");
});

it("goes to the fallback when opened from a link, with nothing to go back to", async () => {
  await renderRouter(routes, { initialUrl: "/saved" });
  await fireEvent.press(screen.getByRole("button"));
  expect(screen).toHavePathname("/list");
  expect(screen.getByText("list-screen")).toBeTruthy();
});
