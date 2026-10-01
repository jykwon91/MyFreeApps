import { Button } from "@platform/ui";
import NumberField from "@/games/wow-forever/components/shared/NumberField";

interface CraftSkillInputProps {
  skill: number | null;
  onChange: (skill: number | null) => void;
  /** "Jump to my step" scrolls here; null hides the button. */
  currentRowId: string | null;
  /** What the route says for this skill, e.g. "Craft Woolen Cape until 95". */
  status: string | null;
}

function scrollToRow(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** "Your skill" — highlights your row in the route and trims the shopping list. */
export default function CraftSkillInput({ skill, onChange, currentRowId, status }: CraftSkillInputProps) {
  return (
    <div className="rounded-xl border bg-card p-3 flex flex-wrap items-end gap-3">
      <NumberField label="Your skill" value={skill} onChange={onChange} min={1} className="flex flex-col gap-1 w-28" />
      {currentRowId ? (
        <Button variant="secondary" onClick={() => scrollToRow(currentRowId)}>
          Jump to my step
        </Button>
      ) : null}
      <p className="text-sm text-muted-foreground min-w-0 basis-full sm:basis-auto sm:flex-1" aria-live="polite">
        {status ?? "Type your skill (open your profession window to see it) and the route points at your row."}
      </p>
    </div>
  );
}
