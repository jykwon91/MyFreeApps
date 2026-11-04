import { act } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import { SINGLE_COPY_SCREENS } from "../src/constants/singleCopyScreens";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

function Layout() {
  return (
    <Stack>
      {SINGLE_COPY_SCREENS.map((name) => (
        <Stack.Screen dangerouslySingular key={name} name={name} />
      ))}
    </Stack>
  );
}

function Page() {
  return <Text>page</Text>;
}

const routes = {
  _layout: Layout,
  index: Page,
  ...Object.fromEntries(SINGLE_COPY_SCREENS.map((name) => [name, Page])),
};

function linkTo(name: string): `/${string}` {
  return `/${name.replace("[id]", "x1").replace(/\/?index$/, "")}`;
}

describe("single copy screens", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(SINGLE_COPY_SCREENS)("%s is a real screen", (name) => {
    expect(jest.requireActual(`../app/(app)/${name}`).default).toBeDefined();
  });

  it("recognises every listed screen", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await renderRouter(routes);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(SINGLE_COPY_SCREENS)("%s opens one copy when tapped twice", async (name) => {
    await renderRouter(routes);
    await act(async () => {
      router.push(linkTo(name));
      router.push(linkTo(name));
    });
    expect(screen).toHavePathname(linkTo(name));
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
