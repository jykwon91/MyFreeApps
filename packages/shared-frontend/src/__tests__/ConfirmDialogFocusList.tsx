import { useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";

export interface ConfirmDialogFocusListProps {
  initialItems: readonly string[];
  /** "now" removes the item as the dialog closes; "later" waits for the Reload button, like a list refetch. */
  removal: "now" | "later";
  withFallback?: boolean;
  /** Puts a Load more button after the rows, in the same container. */
  withLoadMore?: boolean;
}

/** A list whose rows open a ConfirmDialog that archives the row, for focus tests. */
export default function ConfirmDialogFocusList({ initialItems, removal, withFallback = false, withLoadMore = false }: ConfirmDialogFocusListProps) {
  const [items, setItems] = useState(initialItems);
  const [archived, setArchived] = useState<readonly string[]>([]);
  const [candidate, setCandidate] = useState<string | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const visible = removal === "later" ? items : items.filter((item) => !archived.includes(item));

  function confirm() {
    if (candidate) setArchived((prev) => [...prev, candidate]);
    setCandidate(null);
  }

  return (
    <div>
      <button ref={newButtonRef} type="button">New</button>
      <button type="button" onClick={() => setItems((prev) => prev.filter((item) => !archived.includes(item)))}>
        Reload
      </button>
      <ul>
        {visible.map((item) => (
          <li key={item}>
            <span>{item}</span>
            <button type="button">Edit {item}</button>
            <button type="button" onClick={() => setCandidate(item)}>Archive {item}</button>
          </li>
        ))}
        {withLoadMore ? <button type="button">Load more</button> : null}
      </ul>
      <ConfirmDialog
        open={candidate !== null}
        title="Archive?"
        description="It moves to the archived list."
        confirmLabel="Archive"
        onConfirm={confirm}
        onCancel={() => setCandidate(null)}
        fallbackFocusRef={withFallback ? newButtonRef : undefined}
      />
    </div>
  );
}
