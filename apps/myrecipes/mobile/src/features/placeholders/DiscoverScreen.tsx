import { EmptyState, useTheme } from "@platform/mobile";
import { View } from "react-native";

export default function DiscoverScreen() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
      <EmptyState
        body="Find new recipes from around the web. This isn't available in the app yet."
        heading="Discover"
      />
    </View>
  );
}
