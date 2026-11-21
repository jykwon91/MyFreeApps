import { Code2 } from "lucide-react";
import SkillAddForm from "@/features/profile/SkillAddForm";
import { deleteWithFeedback } from "@/lib/delete-with-feedback";
import { useDeleteSkillMutation } from "@myjobhunter/api-client/store/skillsApi";
import type { SkillsSectionProps } from "@/types/profile/skills-section-props";

export default function SkillsSection({ skills }: SkillsSectionProps) {
  const [deleteSkill] = useDeleteSkillMutation();

  async function handleDelete(id: string, name: string) {
    await deleteWithFeedback(() => deleteSkill(id).unwrap(), `Skill "${name}" removed`, "Couldn't remove skill");
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
            <span
              key={skill.id}
              className="inline-flex items-center gap-1.5 text-sm bg-muted px-3 py-1.5 rounded-full"
            >
              <span>{skill.name}</span>
              {/* years_experience is number | null; 0 years is a valid distinct value — keep !== null */}
              {skill.years_experience !== null ? (
                <span className="text-xs text-muted-foreground">{skill.years_experience}y</span>
              ) : null}
              <button
                onClick={() => void handleDelete(skill.id, skill.name)}
                className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors min-h-[20px] min-w-[20px] flex items-center justify-center"
                aria-label={`Remove ${skill.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No skills added yet</p>
      )}

      <SkillAddForm existingNames={skills.map((s) => s.name)} />
    </section>
  );
}
