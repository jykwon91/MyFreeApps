import { AlertTriangle, Info } from "lucide-react";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { PLAN_NOTE_KIND, type PlanNoteKind } from "@/games/wow-forever/types/goalPlanner/planNoteKind";
import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";

/** Notes that stop the plan working as written; the rest are just good to know. */
const WARNING_KINDS: ReadonlySet<PlanNoteKind> = new Set([PLAN_NOTE_KIND.level, PLAN_NOTE_KIND.skill, PLAN_NOTE_KIND.tooMany, PLAN_NOTE_KIND.noSource, PLAN_NOTE_KIND.offRoute]);

/** What the plan couldn't do or can't count on. */
export default function GoalPlanNotes({ notes }: { notes: readonly PlanNote[] }) {
  if (!notes.length) return null;
  return (
    <section className="rounded-lg border bg-card p-3 space-y-1" aria-labelledby="goal-notes-heading" data-testid="plan-notes">
      <h3 id="goal-notes-heading" className="text-sm font-semibold">
        {GOAL_PLANNER_TEXT.notesHeading}
      </h3>
      <ul className="space-y-1">
        {notes.map((note) => {
          const Icon = WARNING_KINDS.has(note.kind) ? AlertTriangle : Info;
          return (
            <li key={note.text} className="flex gap-2 text-sm" data-testid={`plan-note-${note.kind}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{note.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
