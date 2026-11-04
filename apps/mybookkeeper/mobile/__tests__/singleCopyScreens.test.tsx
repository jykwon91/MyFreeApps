import { router, Stack } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import { act } from "@testing-library/react-native";
import { Text } from "react-native";
import { SINGLE_COPY_SCREENS } from "../src/constants/singleCopyScreens";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

function Layout() {
  return (
    <Stack>
      {SINGLE_COPY_SCREENS.filter((name) => name.startsWith("leases")).map((name) => (
        <Stack.Screen dangerouslySingular key={name} name={name} />
      ))}
    </Stack>
  );
}

const routes = {
  _layout: Layout,
  index: () => <Text>home</Text>,
  "leases/index": () => <Text>leases</Text>,
  "leases/[id]": () => <Text>one lease</Text>,
};

describe("single copy screens", () => {
  it.each(SINGLE_COPY_SCREENS)("%s is a real screen", (name) => {
    expect(jest.requireActual(`../app/(app)/${name}`).default).toBeDefined();
  });

  it("opens one copy when a row is tapped twice", async () => {
    await renderRouter(routes);
    await act(async () => {
      router.push("/leases/l1");
      router.push("/leases/l1");
    });
    expect(screen).toHavePathname("/leases/l1");
    await act(async () => router.back());
    expect(screen).toHavePathname("/");
  });

  it("still opens a different lease on top", async () => {
    await renderRouter(routes);
    await act(async () => router.push("/leases/l1"));
    await act(async () => router.push("/leases/l2"));
    expect(screen).toHavePathname("/leases/l2");
    await act(async () => router.back());
    expect(screen).toHavePathname("/leases/l1");
  });
});
