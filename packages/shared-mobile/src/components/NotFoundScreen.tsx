import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/useTheme";
import type { NotFoundScreenProps } from "../types/NotFoundScreenProps";
import EmptyState from "./EmptyState";

/** Where a link to a screen the app doesn't have lands, with a way back to the app. */
export default function NotFoundScreen({ heading, body, homeRoute, homeLabel }: NotFoundScreenProps) {
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingTop: top,
        paddingBottom: bottom,
        backgroundColor: colors.background,
      }}
    >
      <EmptyState
        action={{ label: homeLabel, onPress: () => router.replace(homeRoute) }}
        body={body}
        heading={heading}
      />
    </View>
  );
}
