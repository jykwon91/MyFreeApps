import { SheetModal, useTheme } from "@platform/mobile";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CookBarButton from "./CookBarButton";

export default function CookSheet({
  children,
  onClose,
  testID,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  testID: string;
  title: string;
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <SheetModal isOpen onRequestClose={onClose} testID={testID}>
      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: spacing.lg,
            paddingRight: spacing.sm,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ flex: 1, flexShrink: 1, color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}
          >
            {title}
          </Text>
          <CookBarButton label="Close" onPress={onClose} />
        </View>
        {children}
      </SafeAreaView>
    </SheetModal>
  );
}
