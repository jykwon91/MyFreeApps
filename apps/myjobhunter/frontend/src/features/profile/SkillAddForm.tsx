import { useState } from "react";
import { Plus } from "lucide-react";
import { LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { useCreateSkillMutation } from "@/lib/skillsApi";

// ---------------------------------------------------------------------------
// Skill year options — used by the years-of-experience select.
// ---------------------------------------------------------------------------

const SKILL_YEAR_OPTIONS = [
  { value: "", label: "— yrs —" },
  { value: "1", label: "< 1 yr" },
  { value: "2", label: "2 yrs" },
  { value: "3", label: "3 yrs" },
  { value: "5", label: "5 yrs" },
  { value: "7", label: "7 yrs" },
  { value: "10", label: "10+ yrs" },
];

interface SkillAddFormProps {
  existingNames: string[];
}

export default function SkillAddForm({ existingNames }: SkillAddFormProps) {
  const [name, setName] = useState("");
  const [years, setYears] = useState("");
  const [createSkill, { isLoading }] = useCreateSkillMutation();

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existingNames.map((n) => n.toLowerCase()).includes(trimmed.toLowerCase())) {
      showError(`Skill "${trimmed}" already exists`);
      return;
    }
    try {
      await createSkill({
        name: trimmed,
        years_experience: years ? parseInt(years, 10) : null,
        category: null,
      }).unwrap();
      showSuccess(`Skill "${trimmed}" added`);
      setName("");
      setYears("");
    } catch (err) {
      showError(`Couldn't add skill: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div className="flex items-center gap-2 mt-3">
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
      />
      <select
        value={years}
        onChange={(e) => setYears(e.target.value)}
        className="border rounded-md px-2 py-2 text-sm bg-background"
        aria-label="Years of experience"
      >
        {SKILL_YEAR_OPTIONS.map((o) => (
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
      >
        <Plus size={16} />
      </LoadingButton>
    </div>
  );
}
