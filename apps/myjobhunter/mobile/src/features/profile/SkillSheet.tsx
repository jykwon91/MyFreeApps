import { SKILL_NAME_MAX_LENGTH } from "@myjobhunter/api-client/constants/profileFieldLimits";
import { useCreateSkillMutation } from "@myjobhunter/api-client/store/skillsApi";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { isConflict } from "@myjobhunter/api-client/utils/isConflict";
import { skillCreateRequest } from "@myjobhunter/api-client/utils/skillCreateRequest";
import { skillNameProblem } from "@myjobhunter/api-client/utils/skillNameProblem";
import { FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { SKILL_MESSAGES as MESSAGES } from "../../constants/profileSkills";
import { SKILL_YEAR_CHOICES } from "../../constants/skillYearChoices";
import type { SkillSheetProps } from "../../types/SkillSheetProps";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import SheetButtons from "../../components/forms/SheetButtons";

/** Adds a skill, with its years if known. A skill you have already is caught before it is sent. */
export default function SkillSheet({ existingNames, onClose }: SkillSheetProps) {
  const { showToast } = useToast();
  const [createSkill, { isLoading }] = useCreateSkillMutation();
  const [name, setName] = useState("");
  const [years, setYears] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Names the server said are taken (a 409: added on another device, not yet in the list here).
  const [takenNames, setTakenNames] = useState<readonly string[]>([]);
  const knownNames = [...existingNames, ...takenNames];
  const problem = hasTried ? skillNameProblem(name, knownNames) : undefined;

  async function save(): Promise<void> {
    setHasTried(true);
    if (skillNameProblem(name, knownNames)) return;
    setFailure(null);
    try {
      await createSkill(skillCreateRequest({ name, years })).unwrap();
      showToast(MESSAGES.created);
      onClose();
    } catch (error) {
      if (isConflict(error)) setTakenNames((taken) => [...taken, name.trim()]);
      else setFailure(MESSAGES.couldntCreate);
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isLoading ? undefined : onClose())} title={MESSAGES.addTitle}>
      <FormField
        autoCorrect={false}
        counter={characterCounter(name.trim(), SKILL_NAME_MAX_LENGTH)}
        editable={!isLoading}
        error={problem}
        label={MESSAGES.nameLabel}
        onChangeText={setName}
        placeholder={MESSAGES.namePlaceholder}
        required
        value={name}
      />
      <ChoiceGroup<string> disabled={isLoading} label={MESSAGES.yearsLabel} onChange={setYears} options={SKILL_YEAR_CHOICES} value={years} />
      <SheetButtons
        cancelLabel={PROFILE_MESSAGES.cancel}
        isSubmitting={isLoading}
        onCancel={onClose}
        onSubmit={save}
        submitLabel={MESSAGES.create}
        submittingLabel={MESSAGES.creating}
      />
    </FormSheet>
  );
}
