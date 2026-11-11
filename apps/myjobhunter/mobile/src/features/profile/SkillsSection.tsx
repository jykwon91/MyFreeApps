import type { Skill } from "@myjobhunter/api-client/types/skill/skill";
import { useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { SKILL_MESSAGES as MESSAGES } from "../../constants/profileSkills";
import type { ProfileSectionProps } from "../../types/ProfileSectionProps";
import ProfileListSection from "./ProfileListSection";
import SkillChip from "./SkillChip";
import SkillSheet from "./SkillSheet";

export default function SkillsSection({ state }: ProfileSectionProps<Skill>) {
  const { colors, spacing, fontSize } = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  return (
    <>
      <ProfileListSection
        addLabel={MESSAGES.add}
        couldntLoad={MESSAGES.couldntLoad}
        emptyBody={MESSAGES.noneBody}
        emptyHeading={MESSAGES.none}
        loadingLabel={MESSAGES.loading}
        onAdd={() => setIsAdding(true)}
        renderItems={(items) => (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.tapToRemove}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {items.map((skill) => (
                <SkillChip key={skill.id} skill={skill} />
              ))}
            </View>
          </View>
        )}
        state={state}
        testID="profile-skills"
        title={MESSAGES.title}
        tryAgain={MESSAGES.tryAgain}
      />
      {isAdding ? <SkillSheet existingNames={(state.items ?? []).map(({ name }) => name)} onClose={() => setIsAdding(false)} /> : null}
    </>
  );
}
