import { useState } from "react";
import { Button, ConfirmDialog } from "@platform/ui";
import BisListCopyLinkButton from "@/games/wow-forever/components/gear/bisLists/BisListCopyLinkButton";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";

interface BisListActionsProps {
  list: BisList;
  canDuplicate: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Copy link, Rename, Duplicate and Delete (which asks first). */
export default function BisListActions({ list, canDuplicate, onRename, onDuplicate, onDelete }: BisListActionsProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BisListCopyLinkButton list={list} />
      <Button variant="secondary" onClick={onRename}>
        Rename
      </Button>
      <Button variant="secondary" onClick={onDuplicate} disabled={!canDuplicate}>
        Duplicate
      </Button>
      <Button variant="secondary" className="text-destructive" onClick={() => setConfirming(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`Delete “${list.name}”?`}
        description="The list is removed from this browser. Links you've already shared keep working."
        confirmLabel="Delete list"
        variant="danger"
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
