import { ASSIGNABLE_ROLE_OPTIONS } from "@mybookkeeper/api-client/constants/orgRoles";
import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Modal, ScrollView, Text, View } from "react-native";
import { MEMBERS_MESSAGES as MESSAGES } from "../../constants/members";
import { memberName } from "./membersDisplay";
import RoleChoiceRow from "./RoleChoiceRow";

interface MemberSheetProps {
  member: OrgMember;
  orgName: string;
  onChooseRole: (role: AssignableRole) => void;
  onRemove: () => void;
  onClose: () => void;
}

export default function MemberSheet({ member, orgName, onChooseRole, onRemove, onClose }: MemberSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {memberName(member)}
          </Text>
          {member.user_email ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{member.user_email}</Text> : null}
        </View>
        <View accessibilityLabel={MESSAGES.role} accessibilityRole="radiogroup">
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.role}</Text>
          {ASSIGNABLE_ROLE_OPTIONS.map((choice) => (
            <RoleChoiceRow
              description={choice.description}
              isSelected={member.org_role === choice.value}
              key={choice.value}
              label={choice.label}
              onPress={() => {
                if (member.org_role !== choice.value) onChooseRole(choice.value);
              }}
            />
          ))}
        </View>
        <LoadingButton onPress={onRemove} variant="destructive">
          {MESSAGES.removeFrom(orgName)}
        </LoadingButton>
        <LoadingButton onPress={onClose} variant="ghost">
          {MESSAGES.close}
        </LoadingButton>
      </ScrollView>
    </Modal>
  );
}
