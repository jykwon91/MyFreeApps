import { useState } from "react";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import WorkHistoryDialog from "@/features/profile/WorkHistoryDialog";
import { deleteWithFeedback } from "@/lib/delete-with-feedback";
import { formatWorkDateRange } from "@myjobhunter/api-client/utils/formatWorkDateRange";
import { useDeleteWorkHistoryMutation } from "@myjobhunter/api-client/store/workHistoryApi";
import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";
import type { WorkHistorySectionProps } from "@/types/profile/work-history-section-props";

export default function WorkHistorySection({ entries }: WorkHistorySectionProps) {
  const [deleteWorkHistory] = useDeleteWorkHistoryMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkHistory | undefined>();

  async function handleDelete(id: string, company: string) {
    if (!confirm(`Delete "${company}" from work history?`)) return;
    await deleteWithFeedback(() => deleteWorkHistory(id).unwrap(), "Work history deleted", "Couldn't delete");
  }

  return (
    <>
      <section className="border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={16} className="text-muted-foreground" />
            <h2 className="font-semibold">Work history</h2>
          </div>
          <button
            onClick={() => {
              setEditTarget(undefined);
              setDialogOpen(true);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
            aria-label="Add work history"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No work history added yet</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Briefcase size={14} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">{entry.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatWorkDateRange(entry.start_date, entry.end_date, entry.is_current)}
                  </p>
                  {entry.bullets.length > 0 ? (
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      {entry.bullets.map((b, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          {b}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditTarget(entry);
                      setDialogOpen(true);
                    }}
                    className="p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Edit ${entry.company_name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => void handleDelete(entry.id, entry.company_name)}
                    className="p-2 rounded hover:bg-destructive/10 text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Delete ${entry.company_name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <WorkHistoryDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={editTarget} />
    </>
  );
}
