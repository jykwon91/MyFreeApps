import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Pressable, Text, View } from "react-native";
import { HOME_CATEGORY_BAR_HEIGHT } from "../../constants/home";
import { spokenMoney } from "../transactions/transactionDisplay";

/** One category, with a bar as long as its share of the biggest one. */
export default function CategoryBarRow({
  label,
  amount,
  largest,
  onPress,
}: {
  label: string;
  amount: number;
  largest: number;
  onPress: () => void;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={`${label}, ${spokenMoney(amount)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", gap: spacing.xs }}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>
          {label}
        </Text>
        <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: colors.foreground }}>{formatCurrency(amount)}</Text>
      </View>
      <View style={{ height: HOME_CATEGORY_BAR_HEIGHT, borderRadius: radius.sm, backgroundColor: colors.muted }}>
        <View
          style={{ width: `${(amount / largest) * 100}%`, height: "100%", borderRadius: radius.sm, backgroundColor: colors.destructiveText }}
          testID="category-bar"
        />
      </View>
    </Pressable>
  );
}
