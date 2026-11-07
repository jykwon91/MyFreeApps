import { useState, type FormEvent } from "react";
import { Button } from "@platform/ui";
import { MAX_BIS_LIST_NAME_LENGTH } from "@/games/wow-forever/data/bisLists/bisListConfig";

interface BisListRenameFormProps {
  name: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/** Rename in place: the name box, Save, Cancel (Esc cancels too). */
export default function BisListRenameForm({ name, onSave, onCancel }: BisListRenameFormProps) {
  const [value, setValue] = useState(name);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(value);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 grow min-w-0 basis-56">
        <span className="text-xs font-medium text-muted-foreground">List name</span>
        <input
          value={value}
          maxLength={MAX_BIS_LIST_NAME_LENGTH}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          className="border rounded-md px-3 py-2 text-base min-h-[44px] w-full bg-card"
        />
      </label>
      <Button type="submit" disabled={value.trim() === ""}>
        Save name
      </Button>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
