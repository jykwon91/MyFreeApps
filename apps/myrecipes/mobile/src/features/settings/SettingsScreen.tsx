import { AccountSettings, AppVersion, LoadingButton, MoreRow, Skeleton, UnreadableSession, useSession, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { APP_NAME } from "../../constants/app";
import { DELETE_ACCOUNT_ROUTE, SECURITY_MENU_ITEM, SECURITY_ROUTE } from "../../constants/security";
import { SUPPORT_MENU_ITEM } from "../../constants/support";

export default function SettingsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const { state } = useSession();
  const router = useRouter();

  const headingStyle = { color: colors.foreground, fontSize: fontSize.lg, fontWeight: "700" } as const;
  const bodyStyle = { color: colors.mutedForeground, fontSize: fontSize.sm } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {state.status === "restoring" ? <Skeleton height={120} testID="account-skeleton" /> : null}
        {state.status === "unreadable" ? <UnreadableSession onSignInInstead={() => router.push("/sign-in")} /> : null}
        {state.status === "signedOut" ? (
          <View style={{ gap: spacing.sm }}>
            <Text accessibilityRole="header" style={headingStyle}>
              You're not signed in
            </Text>
            <Text style={bodyStyle}>Sign in to use your MyRecipes account on this phone.</Text>
            <LoadingButton onPress={() => router.push("/sign-in")}>Sign in</LoadingButton>
          </View>
        ) : null}
        {state.status === "signedIn" ? (
          <>
            <MoreRow item={SECURITY_MENU_ITEM} onPress={() => router.push(SECURITY_ROUTE)} webBaseUrl={WEB_BASE_URL} />
            {/* Keyed so another account starts with its own device list. */}
            <AccountSettings appName={APP_NAME} key={state.email} onDeleteAccount={() => router.push(DELETE_ACCOUNT_ROUTE)} />
          </>
        ) : null}
        {/* The website's support page is public, so this shows signed in or out. */}
        <MoreRow item={SUPPORT_MENU_ITEM} webBaseUrl={WEB_BASE_URL} />
        <AppVersion />
      </ScrollView>
    </View>
  );
}
