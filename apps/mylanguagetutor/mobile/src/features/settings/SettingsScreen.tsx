import { AccountSettings, AppVersion, MoreMenuGroups, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { APP_NAME } from "../../constants/app";
import { DELETE_ACCOUNT_ROUTE } from "../../constants/security";
import { SETTINGS_MENU } from "../../constants/settingsMenu";

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <MoreMenuGroups groups={SETTINGS_MENU} webBaseUrl={WEB_BASE_URL} />
      <AccountSettings appName={APP_NAME} onDeleteAccount={() => router.push(DELETE_ACCOUNT_ROUTE)} />
      <AppVersion />
    </ScrollView>
  );
}
