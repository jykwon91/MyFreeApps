import { ClampedText, CollapsibleHeader, LARGE_TEXT_PREVIEW_LINES, useTheme } from "@platform/mobile";
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";

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
      <CollapsibleHeader
        action={<Text style={{ fontSize: fontSize.sm, color: colors.primary }}>{isOpen ? "Hide" : "Show"}</Text>}
        actionLabel={preview && !isOpen ? `${title}, ${preview}` : title}
        below={
          preview && !isOpen ? (
            <ClampedText largeTextNumberOfLines={LARGE_TEXT_PREVIEW_LINES} numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {preview}
            </ClampedText>
          ) : null
        }
        isOpen={isOpen}
        onToggle={() => {
          if (!isOpen) onOpen?.();
          setIsOpen(!isOpen);
        }}
        title={title}
      />
      {isOpen ? children : null}
    </View>
  );
}
