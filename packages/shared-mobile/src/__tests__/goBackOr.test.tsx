import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Pressable, Text } from "react-native";
import { goBackOr } from "../utils/goBackOr";

function DetailScreen() {
  return (
    <Pressable accessibilityRole="button" onPress={() => goBackOr("/list")}>
      <Text>detail-screen</Text>
    </Pressable>
  );
}

const routes = {
  _layout: () => <Stack />,
  index: () => <Text>previous-screen</Text>,
  list: () => <Text>list-screen</Text>,
  detail: () => <DetailScreen />,
};

it("goes back when there is a screen behind", async () => {
  await renderRouter(routes, { initialUrl: "/" });
  await act(async () => router.push("/detail"));
  await fireEvent.press(screen.getByRole("button"));
  expect(screen).toHavePathname("/");
});

it("goes to the fallback when opened cold", async () => {
  await renderRouter(routes, { initialUrl: "/detail" });
  await fireEvent.press(screen.getByRole("button"));
  expect(screen.getByText("list-screen")).toBeTruthy();
  expect(screen).toHavePathname("/list");
});
