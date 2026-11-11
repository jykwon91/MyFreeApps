import { useState } from "react";
import { Plus } from "lucide-react";
import { LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { useCreateSkillMutation } from "@myjobhunter/api-client/store/skillsApi";
import { isConflict } from "@myjobhunter/api-client/utils/isConflict";
import { skillCreateRequest } from "@myjobhunter/api-client/utils/skillCreateRequest";
import { skillNameProblem } from "@myjobhunter/api-client/utils/skillNameProblem";
import { SKILL_YEAR_CHOICES } from "@/constants/skill-year-choices";
import type { SkillAddFormProps } from "@/types/profile/skill-add-form-props";

const PROBLEM_ID = "skill-add-problem";

/**
 * Adds a skill inline. A blank, repeated or too-long name is caught, with the phone's wording, before
 * it is sent; a name the server says is taken (a 409, added in another tab) then shows the same
 * duplicate message under the field.
 */
export default function SkillAddForm({ existingNames }: SkillAddFormProps) {
  const [name, setName] = useState("");
  const [years, setYears] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [takenNames, setTakenNames] = useState<string[]>([]);
  const [createSkill, { isLoading }] = useCreateSkillMutation();
  const knownNames = [...existingNames, ...takenNames];
  const problem = hasTried ? skillNameProblem(name, knownNames) : undefined;

  async function handleAdd() {
    setHasTried(true);
    if (skillNameProblem(name, knownNames)) return;
    const trimmed = name.trim();
    try {
      await createSkill(skillCreateRequest({ name, years })).unwrap();
      showSuccess(`Skill "${trimmed}" added`);
      setName("");
      setYears("");
      setHasTried(false);
    } catch (err) {
      if (isConflict(err)) setTakenNames((names) => [...names, trimmed]);
      else showError(`Couldn't add skill: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="Add a skill..."
          aria-label="Skill name"
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? PROBLEM_ID : undefined}
        />
        <select
          value={years}
          onChange={(e) => setYears(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm bg-background"
          aria-label="Years of experience"
        >
          {SKILL_YEAR_CHOICES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <LoadingButton
          type="button"
          isLoading={isLoading}
          loadingText="Adding..."
          onClick={() => void handleAdd()}
          className="min-h-[44px]"
          aria-label="Add skill"
        >
          <Plus size={16} />
        </LoadingButton>
      </div>
      {problem ? (
        <p id={PROBLEM_ID} role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
