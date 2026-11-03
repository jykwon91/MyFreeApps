import { useTheme } from "@platform/mobile";
import type { ReactNode } from "react";
import { Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CookBarButton from "./CookBarButton";

export default function CookSheet({
  children,
  isAnimated,
  onClose,
  testID,
  title,
}: {
  children: ReactNode;
  isAnimated: boolean;
  onClose: () => void;
  testID: string;
  title: string;
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <Modal
      animationType={isAnimated ? "slide" : "none"}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      testID={testID}
      visible
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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
            style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}
          >
            {title}
          </Text>
          <CookBarButton label="Close" onPress={onClose} />
        </View>
        {children}
      </SafeAreaView>
    </Modal>
  );
}
