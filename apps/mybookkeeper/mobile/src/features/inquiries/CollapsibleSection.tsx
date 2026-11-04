import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

export default function CollapsibleSection({
  title,
  preview,
  onOpen,
  children,
}: {
  title: string;
  preview?: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        accessibilityLabel={preview && !isOpen ? `${title}, ${preview}` : title}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => {
          if (!isOpen) onOpen?.();
          setIsOpen(!isOpen);
        }}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", gap: spacing.xs }}
      >
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {title}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.primary }}>{isOpen ? "Hide" : "Show"}</Text>
        </View>
        {preview && !isOpen ? (
          <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {preview}
          </Text>
        ) : null}
      </Pressable>
      {isOpen ? children : null}
    </View>
  );
}
