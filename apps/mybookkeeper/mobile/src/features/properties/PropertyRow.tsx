import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { PROPERTY_MESSAGES } from "../../constants/properties";
import InquiryChip from "../inquiries/InquiryChip";
import { needsClassification, propertySpokenLabel, propertyUse } from "./propertyDisplay";

interface PropertyRowProps {
  property: Property;
  onPress: () => void;
}

export default function PropertyRow({ property, onPress }: PropertyRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const use = propertyUse(property);
  const isWaiting = needsClassification(property);
  return (
    <Pressable
      accessibilityLabel={propertySpokenLabel(property)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {property.name}
      </Text>
      {property.address ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {property.address}
        </Text>
      ) : null}
      {use ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{use}</Text> : null}
      {isWaiting || !property.is_active ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {property.is_active ? null : <InquiryChip label={PROPERTY_MESSAGES.inactive} />}
          {isWaiting ? <InquiryChip label={PROPERTY_MESSAGES.needsClassification} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}
