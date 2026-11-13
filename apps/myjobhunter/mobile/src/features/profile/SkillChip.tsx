import { useDeleteSkillMutation } from "@myjobhunter/api-client/store/skillsApi";
import { MIN_TOUCH_TARGET, useConfirmedRemoval, useTheme } from "@platform/mobile";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { SKILL_MESSAGES as MESSAGES } from "../../constants/profileSkills";
import { formatSkillYears } from "../../lib/formatSkillYears";
import type { SkillChipProps } from "../../types/SkillChipProps";

/** A skill and its years. Tapping it asks to remove it; it shows the removal in flight. */
export default function SkillChip({ skill }: SkillChipProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [deleteSkill] = useDeleteSkillMutation();
  const { isRemoving, confirmRemove } = useConfirmedRemoval(() => deleteSkill(skill.id).unwrap(), {
    ...MESSAGES,
    removeBody: `${skill.name} — ${MESSAGES.removeBody}`,
    remove: PROFILE_MESSAGES.remove,
    keep: PROFILE_MESSAGES.keep,
  });
  const years = formatSkillYears(skill.years_experience);
  return (
    <Pressable
      accessibilityHint={MESSAGES.removeHint}
      accessibilityLabel={`${PROFILE_MESSAGES.remove} ${skill.name}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: isRemoving, busy: isRemoving }}
      disabled={isRemoving}
      onPress={confirmRemove}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.border : colors.muted,
        opacity: isRemoving ? 0.6 : 1,
      })}
      testID={`skill-${skill.id}`}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{skill.name}</Text>
      {years ? <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{years}</Text> : null}
      {isRemoving ? (
        <ActivityIndicator accessibilityLabel={PROFILE_MESSAGES.removing} color={colors.mutedForeground} size="small" />
      ) : (
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>×</Text>
      )}
    </Pressable>
  );
}
