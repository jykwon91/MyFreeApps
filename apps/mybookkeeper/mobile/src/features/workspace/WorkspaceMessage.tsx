import { LoadingButton, useSession, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

interface WorkspaceMessageProps {
  heading: string;
  body: string;
  action: { label: string; onPress: () => void | Promise<void> };
  canSignOut?: boolean;
}

export default function WorkspaceMessage({ heading, body, action, canSignOut = true }: WorkspaceMessageProps) {
  const { session } = useSession();
  const { colors, fontSize, spacing } = useTheme();

  async function signOut(): Promise<void> {
    await session.signOut();
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "700" }}>
        {heading}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{body}</Text>
      <LoadingButton onPress={action.onPress}>{action.label}</LoadingButton>
      {canSignOut ? (
        <LoadingButton loadingText="Signing out..." onPress={signOut} variant="ghost">
          Sign out
        </LoadingButton>
      ) : null}
    </View>
  );
}
