import { EmptyState, useTheme } from "@platform/mobile";
import Constants from "expo-constants";
import { Text, View } from "react-native";

export default function SettingsScreen() {
  const { colors, fontSize } = useTheme();
  const version = Constants.expoConfig?.version;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.background,
      }}
    >
      <EmptyState body="Account and app settings will appear here." heading="Settings" />
      {version ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
          Version {version}
        </Text>
      ) : null}
    </View>
  );
}
