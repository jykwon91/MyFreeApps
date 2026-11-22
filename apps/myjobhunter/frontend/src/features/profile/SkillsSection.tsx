import { useState } from "react";
import { Code2 } from "lucide-react";
import { ConfirmDialog, extractErrorMessage, isNotFound, showError, showSuccess } from "@platform/ui";
import { useDeleteSkillMutation } from "@myjobhunter/api-client/store/skillsApi";
import type { Skill } from "@myjobhunter/api-client/types/skill/skill";
import { skillRemoveBody } from "@myjobhunter/api-client/utils/skillRemoveBody";
import { SKILL_MESSAGES as MESSAGES } from "@/constants/skill-messages";
import SkillAddForm from "@/features/profile/SkillAddForm";
import SkillChip from "@/features/profile/SkillChip";
import type { SkillsSectionProps } from "@/types/profile/skills-section-props";

export default function SkillsSection({ skills }: SkillsSectionProps) {
  const [removing, setRemoving] = useState<Skill | null>(null);
  const [deleteSkill, { isLoading: isRemoving }] = useDeleteSkillMutation();

  async function confirmRemove(): Promise<void> {
    if (!removing) return;
    const { id, name } = removing;
    try {
      await deleteSkill(id).unwrap();
    } catch (err) {
      // A 404 means it's already gone (removed in another tab, or a double click): what was asked for.
      if (!isNotFound(err)) {
        showError(`${MESSAGES.couldntRemove}: ${extractErrorMessage(err)}`);
        return;
      }
    }
    showSuccess(MESSAGES.removed(name));
    setRemoving(null);
  }

  return (
    <section className="border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Code2 size={16} className="text-muted-foreground" />
        <h2 className="font-semibold">Skills</h2>
      </div>

      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <SkillChip key={skill.id} skill={skill} onRemove={setRemoving} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No skills added yet</p>
      )}

      <SkillAddForm existingNames={skills.map((s) => s.name)} />

      <ConfirmDialog
        open={removing !== null}
        title={MESSAGES.removeTitle}
        description={removing ? skillRemoveBody(removing.name) : ""}
        confirmLabel={MESSAGES.remove}
        cancelLabel={MESSAGES.keep}
        variant="danger"
        isLoading={isRemoving}
        onConfirm={confirmRemove}
        onCancel={() => (isRemoving ? undefined : setRemoving(null))}
      />
    </section>
  );
}
