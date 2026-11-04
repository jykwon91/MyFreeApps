import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Filled when selected, so the selected tab shows by shape as well as by colour. */
export function tabBarIcon(selected: IconName, unselected: IconName = selected) {
  return function TabBarIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? selected : unselected} size={size} style={{ color }} />;
  };
}
