import { EmptyState, useTheme } from "@platform/mobile";
import { Linking, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";

/** A tab whose screen isn't built yet, so the work can still be reached from it. */
export default function ComingToAppScreen({ title, webPath }: { title: string; webPath: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
      <EmptyState
        action={{ label: "Open on the website", onPress: () => Linking.openURL(`${WEB_BASE_URL}${webPath}`) }}
        body="This screen is coming to the app. It's on the website now."
        heading={title}
      />
    </View>
  );
}
