import { AccountSettings, AppVersion, MoreMenuGroups, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { APP_NAME } from "../../constants/app";
import { MORE_MENU } from "../../constants/moreMenu";

export default function MoreScreen() {
  const { colors, spacing } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <MoreMenuGroups groups={MORE_MENU} webBaseUrl={WEB_BASE_URL} />
      <AccountSettings appName={APP_NAME} onDeleteAccount={() => router.push("/delete-account")} />
      <AppVersion />
    </ScrollView>
  );
}
