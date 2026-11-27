import { useEffect, useRef, useState } from "react";
import { Split } from "lucide-react";
import { Button } from "@platform/ui";
import { PROPERTY_SPLIT_LABELS as L } from "@mybookkeeper/api-client/constants/propertySplitLabels";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionPropertySplit } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplit";
import type { TransactionPropertySplitRequest } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplitRequest";
import { canSplit } from "@mybookkeeper/api-client/utils/propertySplit";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import PropertySplitEditor from "./PropertySplitEditor";
import PropertySplitSummary from "./PropertySplitSummary";
import { usePropertySplitActions } from "./usePropertySplitActions";
import { splitSectionMode } from "./splitSectionMode";
import { SPLIT_SECTION_MODE } from "@/shared/lib/split-section-modes";

export interface TransactionPropertySplitSectionProps {
  transaction: Transaction;
  properties: readonly Property[];
  /** The panel's current shares; it holds a snapshot of the transaction. */
  splits: readonly TransactionPropertySplit[];
  onSplitsChange: (splits: TransactionPropertySplit[]) => void;
}

/** On the transaction panel: share one payment between several properties, or undo that. */
export default function TransactionPropertySplitSection({ transaction, properties, splits, onSplitsChange }: TransactionPropertySplitSectionProps) {
  const canWrite = useCanWrite();
  const [isEditing, setIsEditing] = useState(false);
  const { save, remove, isSaving, isRemoving } = usePropertySplitActions(transaction.id, onSplitsChange);

  const isSplit = splits.length > 0;
  const mode = splitSectionMode(isEditing, isSplit);
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const shownMode = useRef(mode);

  // The button pressed goes away with the mode it belongs to, so focus moves into the editor, or back to the heading.
  useEffect(() => {
    if (shownMode.current === mode) return;
    shownMode.current = mode;
    const target = mode === SPLIT_SECTION_MODE.editing ? sectionRef.current?.querySelector<HTMLInputElement>("input") : headingRef.current;
    target?.focus();
  }, [mode]);

  if (!canWrite || (!isSplit && !canSplit(transaction, properties.length))) return null;

  async function handleSave(request: TransactionPropertySplitRequest) {
    if (await save(request)) setIsEditing(false);
  }

  return (
    <section ref={sectionRef} className="px-5 py-4 border-t space-y-3" aria-label={L.heading} data-testid="property-split-section">
      <p ref={headingRef} tabIndex={-1} className="text-xs font-medium text-muted-foreground uppercase tracking-wide outline-none">
        {L.heading}
      </p>
      {mode === SPLIT_SECTION_MODE.editing && (
        <PropertySplitEditor
          amount={transaction.amount}
          properties={properties}
          splits={splits}
          isSaving={isSaving}
          onSave={(request) => void handleSave(request)}
          onCancel={() => setIsEditing(false)}
        />
      )}
      {mode === SPLIT_SECTION_MODE.split && (
        <PropertySplitSummary
          splits={splits}
          propertyNames={new Map(properties.map((property) => [property.id, property.name]))}
          isRemoving={isRemoving}
          onChange={() => setIsEditing(true)}
          onRemove={() => void remove()}
        />
      )}
      {mode === SPLIT_SECTION_MODE.unsplit && (
        <>
          <p className="text-xs text-muted-foreground">{L.help}</p>
          <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" onClick={() => setIsEditing(true)}>
            <Split className="h-4 w-4 mr-1" aria-hidden="true" />
            {L.start}
          </Button>
        </>
      )}
    </section>
  );
}
