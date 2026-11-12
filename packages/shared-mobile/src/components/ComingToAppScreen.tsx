import { View } from "react-native";
import { useOpenWebsite } from "../hooks/useOpenWebsite";
import { useTheme } from "../theme/useTheme";
import type { ComingToAppScreenProps } from "../types/ComingToAppScreenProps";
import EmptyState from "./EmptyState";

/** A tab whose screen isn't built yet, so the work can still be reached from it. */
export default function ComingToAppScreen({ title, webPath, webBaseUrl }: ComingToAppScreenProps) {
  const { colors } = useTheme();
  const openWebsite = useOpenWebsite();
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
      <EmptyState
        action={{ label: "Open on the website", onPress: () => openWebsite(webBaseUrl, webPath) }}
        body="This screen is coming to the app. It's on the website now."
        heading={title}
      />
    </View>
  );
}
