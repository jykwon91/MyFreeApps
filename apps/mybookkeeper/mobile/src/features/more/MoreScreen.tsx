import { type AccountMessage, AccountSection, Toast, useDevices, useTheme } from "@platform/mobile";
import Constants from "expo-constants";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { MORE_MENU } from "../../constants/moreMenu";
import { useActiveWorkspace } from "../workspace/useActiveWorkspace";
import MoreRow from "./MoreRow";

export default function MoreScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const devices = useDevices();
  const { reload } = devices;
  const workspace = useActiveWorkspace();
  const [message, setMessage] = useState<AccountMessage | null>(null);
  const isAdmin = workspace?.org_role === "owner" || workspace?.org_role === "admin";
  const version = Constants.expoConfig?.version;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {MORE_MENU.map((group) => (
          <View key={group.title}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.xs }}
            >
              {group.title}
            </Text>
            {group.items
              .filter((item) => !item.adminOnly || isAdmin)
              .map((item) => (
                <MoreRow item={item} key={item.webPath} />
              ))}
          </View>
        ))}
        <AccountSection appName="MyBookkeeper" devices={devices} onMessage={setMessage} />
        {version ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>Version {version}</Text> : null}
      </ScrollView>
      {message ? <Toast message={message.message} onDismiss={() => setMessage(null)} variant={message.variant} /> : null}
    </View>
  );
}
