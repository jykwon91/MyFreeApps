import { ROLE_LABELS } from "@mybookkeeper/api-client/constants/orgRoles";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { MEMBERS_MESSAGES as MESSAGES } from "../../constants/members";
import { memberName } from "./membersDisplay";

interface MemberRowProps {
  member: OrgMember;
  isMe: boolean;
  canEdit: boolean;
  busyLabel?: string;
  /** Something else is in flight, and its outcome mustn't land behind a sheet. */
  isHeld: boolean;
  onPress: () => void;
}

export default function MemberRow({ member, isMe, canEdit, busyLabel, isHeld, onPress }: MemberRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const name = memberName(member);
  const roleLine = busyLabel ?? ROLE_LABELS[member.org_role];
  const isPressable = canEdit && !busyLabel && !isHeld;
  return (
    <Pressable
      accessibilityLabel={`${name}, ${roleLine}${isMe ? `, ${MESSAGES.you}` : ""}`}
      accessibilityRole={canEdit ? "button" : undefined}
      accessibilityState={canEdit ? { disabled: !isPressable, busy: Boolean(busyLabel) } : undefined}
      disabled={!isPressable}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
      testID={`member-${member.user_id}`}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {name}
          {isMe ? <Text style={{ fontWeight: "400", color: colors.mutedForeground }}>{`  ${MESSAGES.you}`}</Text> : null}
        </Text>
        {member.user_email && member.user_email !== name ? (
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{member.user_email}</Text>
        ) : null}
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{roleLine}</Text>
      </View>
      {canEdit ? <Text style={{ fontSize: fontSize.lg, color: colors.mutedForeground }}>›</Text> : null}
    </Pressable>
  );
}
