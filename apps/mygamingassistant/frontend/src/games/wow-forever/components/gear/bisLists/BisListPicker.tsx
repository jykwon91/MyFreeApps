import { Button, Select } from "@platform/ui";
import { MAX_BIS_LISTS } from "@/games/wow-forever/data/bisLists/bisListConfig";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";

interface BisListPickerProps {
  lists: readonly BisList[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

/** Which of your lists is open, and "New list". */
export default function BisListPicker({ lists, selectedId, onSelect, onNew }: BisListPickerProps) {
  const full = lists.length >= MAX_BIS_LISTS;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        {lists.length > 0 ? (
          <label className="flex flex-col gap-1 grow min-w-0 basis-56">
            <span className="text-xs font-medium text-muted-foreground">Your lists</span>
            <Select value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value)} className="min-h-[44px] bg-card w-full">
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <Button onClick={onNew} disabled={full}>
          New list
        </Button>
      </div>
      {full ? <p className="text-xs text-muted-foreground">You have {MAX_BIS_LISTS} lists, the most this page keeps. Delete one to make another.</p> : null}
    </div>
  );
}
