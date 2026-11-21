import { useState } from "react";
import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import EducationDialog from "@/features/profile/EducationDialog";
import { deleteWithFeedback } from "@/lib/delete-with-feedback";
import { educationDegreeLine } from "@myjobhunter/api-client/utils/educationDegreeLine";
import { educationYearsLine } from "@myjobhunter/api-client/utils/educationYearsLine";
import { useDeleteEducationMutation } from "@myjobhunter/api-client/store/educationApi";
import type { Education } from "@myjobhunter/api-client/types/education/education";
import type { EducationSectionProps } from "@/types/profile/education-section-props";

export default function EducationSection({ entries }: EducationSectionProps) {
  const [deleteEducation] = useDeleteEducationMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Education | undefined>();

  async function handleDelete(id: string, school: string) {
    if (!confirm(`Delete "${school}" from education?`)) return;
    await deleteWithFeedback(() => deleteEducation(id).unwrap(), "Education deleted", "Couldn't delete");
  }

  return (
    <>
      <section className="border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap size={16} className="text-muted-foreground" />
            <h2 className="font-semibold">Education</h2>
          </div>
          <button
            onClick={() => {
              setEditTarget(undefined);
              setDialogOpen(true);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
            aria-label="Add education"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No education added yet</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap size={14} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{entry.school}</p>
                  {educationDegreeLine(entry) ? (
                    <p className="text-sm text-muted-foreground">{educationDegreeLine(entry)}</p>
                  ) : null}
                  {educationYearsLine(entry) ? (
                    <p className="text-xs text-muted-foreground">{educationYearsLine(entry)}</p>
                  ) : null}
                  {entry.gpa ? (
                    <p className="text-xs text-muted-foreground">GPA: {entry.gpa}</p>
                  ) : null}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditTarget(entry);
                      setDialogOpen(true);
                    }}
                    className="p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Edit ${entry.school}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => void handleDelete(entry.id, entry.school)}
                    className="p-2 rounded hover:bg-destructive/10 text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Delete ${entry.school}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <EducationDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={editTarget} />
    </>
  );
}
