import { act } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import type { SingleCopyScreensSuite } from "./types/SingleCopyScreensSuite";

function Page() {
  return <Text>page</Text>;
}

function linkTo(name: string): `/${string}` {
  return `/${name.replace(/\[\w+\]/g, "x1").replace(/\/?index$/, "")}`;
}

/**
 * The checks every app's SINGLE_COPY_SCREENS list needs: each name is a real screen, expo-router
 * recognises them all, a double tap opens one copy, and (given a pair) a different id still opens.
 * The app's test file keeps its own jest.mock of react-native-safe-area-context, as mocks are per file.
 */
export function describeSingleCopyScreens({ screens, loadScreen, distinctPair }: SingleCopyScreensSuite): void {
  function Layout() {
    return (
      <Stack>
        {screens.map((name) => (
          <Stack.Screen dangerouslySingular key={name} name={name} />
        ))}
      </Stack>
    );
  }

  const routes = { _layout: Layout, index: Page, ...Object.fromEntries(screens.map((name) => [name, Page])) };

  describe("single copy screens", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each(screens)("%s is a real screen", (name) => {
      expect(loadScreen(name).default).toBeDefined();
    });

    it("recognises every listed screen", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      await renderRouter(routes);
      expect(warn).not.toHaveBeenCalled();
    });

    it.each(screens)("%s opens one copy when tapped twice", async (name) => {
      await renderRouter(routes);
      await act(async () => {
        router.push(linkTo(name));
        router.push(linkTo(name));
      });
      expect(screen).toHavePathname(linkTo(name));
      await act(async () => router.back());
      expect(screen).toHavePathname("/");
    });

    if (distinctPair) {
      const [first, second] = distinctPair;
      it("still opens a different one on top", async () => {
        await renderRouter(routes);
        await act(async () => router.push(first));
        await act(async () => router.push(second));
        expect(screen).toHavePathname(second);
        await act(async () => router.back());
        expect(screen).toHavePathname(first);
      });
    }
  });
}
