import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";

export interface ConfirmDialogFocusEditorProps {
  /** Mounts the dialog only while it's open, as some callers do. */
  mountWhileOpen?: boolean;
}

/** Confirming opens a field that focuses itself, for focus tests. */
export default function ConfirmDialogFocusEditor({ mountWhileOpen = false }: ConfirmDialogFocusEditorProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) fieldRef.current?.focus();
  }, [editing]);

  const dialog = (
    <ConfirmDialog
      open={open}
      title="Rename?"
      description="You can change the name."
      confirmLabel="Rename"
      onConfirm={() => {
        setOpen(false);
        setEditing(true);
      }}
      onCancel={() => setOpen(false)}
    />
  );

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {editing ? <input ref={fieldRef} aria-label="Name" /> : null}
      {mountWhileOpen ? (open ? dialog : null) : dialog}
    </div>
  );
}
