import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PROPERTY_MESSAGES } from "../../constants/properties";
import InquiryChip from "../inquiries/InquiryChip";
import { needsClassification, propertySpokenLabel, propertyUse } from "./propertyDisplay";

interface PropertyRowProps {
  property: Property;
}

export default function PropertyRow({ property }: PropertyRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const use = propertyUse(property);
  const isWaiting = needsClassification(property);
  return (
    <View
      accessible
      accessibilityLabel={propertySpokenLabel(property)}
      style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
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
    </View>
  );
}
