import { AccountSettings, AppVersion, MoreRow, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { APP_NAME } from "../../constants/app";
import { MORE_MENU } from "../../constants/moreMenu";

export default function MoreScreen() {
  const { colors, fontSize, spacing } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} style={{ backgroundColor: colors.background }}>
      {MORE_MENU.map((group) => (
        <View key={group.title}>
          <Text
            accessibilityRole="header"
            style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.xs }}
          >
            {group.title}
          </Text>
          {group.items.map((item) => (
            <MoreRow item={item} key={item.label} webBaseUrl={WEB_BASE_URL} />
          ))}
        </View>
      ))}
      <AccountSettings appName={APP_NAME} onDeleteAccount={() => router.push("/delete-account")} />
      <AppVersion />
    </ScrollView>
  );
}
