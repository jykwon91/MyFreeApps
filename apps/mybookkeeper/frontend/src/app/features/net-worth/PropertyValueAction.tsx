import { useState } from "react";
import { Button } from "@platform/ui";
import type { NetWorthLine } from "@mybookkeeper/api-client/types/net-worth/net-worth-line";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";
import PropertyValueEditor from "./PropertyValueEditor";

export interface PropertyValueActionProps {
  line: NetWorthLine;
}

/** "Add a value" / "Edit value" under a property, opening the editor in place. */
export default function PropertyValueAction({ line }: PropertyValueActionProps) {
  const [editing, setEditing] = useState(false);
  if (editing) return <PropertyValueEditor line={line} onDone={() => setEditing(false)} />;
  return (
    <div className="mt-2">
      <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" onClick={() => setEditing(true)} data-testid="net-worth-edit-value">
        {line.amount_cents === null ? MSG.addValue : MSG.editValue}
      </Button>
    </div>
  );
}
