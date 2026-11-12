import { Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { MoreMenuGroupsProps } from "../types/MoreMenuGroupsProps";
import type { MoreMenuItem } from "../types/MoreMenuItem";
import MoreRow from "./MoreRow";

/** A More or Settings menu: each group's heading, then its places. */
export default function MoreMenuGroups<Item extends MoreMenuItem>({ groups, webBaseUrl }: MoreMenuGroupsProps<Item>) {
  const { colors, fontSize, spacing } = useTheme();
  return (
    <>
      {groups.map((group) => (
        <View key={group.title}>
          <Text
            accessibilityRole="header"
            style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.xs }}
          >
            {group.title}
          </Text>
          {group.items.map((item) => (
            <MoreRow item={item} key={item.label} webBaseUrl={webBaseUrl} />
          ))}
        </View>
      ))}
    </>
  );
}
