import type { StackRoute } from "../../src/types/StackRoute";
import type { StackState } from "../../src/types/StackState";

type Href = string | { pathname: string; params?: Readonly<object> };

/**
 * The root stack's screens, which the mocked router changes as expo-router's would: back and
 * dismiss pop the top screens and leave the rest, params and all; replace swaps only the top one.
 */
export function fakeStack(initial: readonly StackRoute[]) {
  let routes: StackRoute[] = [...initial];
  return {
    state: (): StackState => ({ index: routes.length - 1, routes }),
    routes: (): readonly StackRoute[] => routes,
    canGoBack: (): boolean => routes.length > 1,
    back: (): void => {
      routes = routes.slice(0, -1);
    },
    dismiss: (count = 1): void => {
      routes = routes.slice(0, Math.max(routes.length - count, 1));
    },
    replace: (href: Href): void => {
      const route = typeof href === "string" ? { name: href } : { name: href.pathname.replace(/^\//, ""), params: href.params };
      routes = [...routes.slice(0, -1), route];
    },
  };
}

export type FakeStack = ReturnType<typeof fakeStack>;
