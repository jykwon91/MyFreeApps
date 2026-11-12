import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

/** The object form of a Tabs navigator's screenOptions. */
export type TabScreenOptions = Exclude<NonNullable<ComponentProps<typeof Tabs>["screenOptions"]>, (...args: never[]) => unknown>;
