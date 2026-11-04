import {
  type AccountMessage,
  LoadingButton,
  Skeleton,
  Toast,
  UnreadableSession,
  useSession,
  useTheme,
} from "@platform/mobile";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import SignedInSettings from "./SignedInSettings";

export default function SettingsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const { state } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState<AccountMessage | null>(null);
  const version = Constants.expoConfig?.version;

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
        {state.status === "signedIn" ? <SignedInSettings key={state.email} onMessage={setMessage} /> : null}
        {version ? (
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>Version {version}</Text>
        ) : null}
      </ScrollView>
      {message ? (
        <Toast
          message={message.message}
          onDismiss={() => setMessage(null)}
          style={{ margin: spacing.md }}
          variant={message.variant}
        />
      ) : null}
    </View>
  );
}
