import { useState } from "react";
import {
  Card,
  LoadingButton,
  Button,
  StatusBadge,
  Skeleton,
  EmptyState,
  FormField,
  ConfirmDialog,
  Select,
  showError,
  showSuccess,
  extractErrorMessage,
  type BadgeTone,
} from "@platform/ui";
import { Calendar, Clock, Pizza, Trash2, Plus, Play, X } from "lucide-react";
import {
  useListDropsQuery,
  useCreateDropMutation,
  useUpdateDropMutation,
  useDeleteDropMutation,
  useAddSlotMutation,
  useDeleteSlotMutation,
} from "@/store/dropsApi";
import {
  type Drop,
  type DropCreateBody,
  type DropStatus,
  type SlotCreateBody,
  DROP_STATUS_LABELS,
  DROP_STATUSES,
} from "@/types/drop/drop";

const STATUS_TONE: Record<DropStatus, BadgeTone> = {
  planning: "info",
  active: "success",
  closed: "neutral",
};

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...DROP_STATUSES.map((s) => ({ value: s, label: DROP_STATUS_LABELS[s] })),
];

export default function DropsPage() {
  const [statusFilter, setStatusFilter] = useState<DropStatus | "">("");
  const { data: drops, isLoading, isError, error, refetch } = useListDropsQuery(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Drops</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One selling event per drop -- planning, active, or closed.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
        >
          <Plus className="h-4 w-4 mr-1" />
          {showCreate ? "Close" : "New drop"}
        </Button>
      </header>

      {showCreate ? (
        <CreateDropCard onCreated={() => setShowCreate(false)} />
      ) : null}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter:</span>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DropStatus | "")}
          className="w-44"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? <DropsListSkeleton /> : null}
      {isError ? (
        <EmptyState
          heading="Could not load drops"
          body={extractErrorMessage(error) || "Please try again."}
          action={{ label: "Retry", onClick: () => refetch() }}
        />
      ) : null}
      {!isLoading && !isError && drops && drops.length === 0 ? (
        <EmptyState
          heading="No drops yet"
          body="Create your first drop to start planning."
          action={{ label: "New drop", onClick: () => setShowCreate(true) }}
        />
      ) : null}
      {!isLoading && drops && drops.length > 0 ? (
        <div className="space-y-3">
          {drops.map((d) => (
            <DropCard key={d.id} drop={d} />
          ))}
        </div>
      ) : null}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DropsListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </Card>
      ))}
    </div>
  );
}

interface CreateDropCardProps {
  onCreated: () => void;
}

function CreateDropCard({ onCreated }: CreateDropCardProps) {
  const [form, setForm] = useState<DropCreateBody>({
    date: new Date().toISOString().slice(0, 10),
    name: "",
    slot_window_start: "11:00",
    slot_window_end: "15:00",
  });
  const [createDrop, { isLoading }] = useCreateDropMutation();

  const submit = async () => {
    try {
      await createDrop({
        ...form,
        slot_window_start: ensureSeconds(form.slot_window_start),
        slot_window_end: ensureSeconds(form.slot_window_end),
      }).unwrap();
      showSuccess("Drop created");
      onCreated();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to create drop");
    }
  };

  return (
    <Card title="New drop">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Dec 25th"
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <FormField label="Date" required>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <FormField label="Window start" required>
          <input
            type="time"
            value={form.slot_window_start}
            onChange={(e) =>
              setForm({ ...form, slot_window_start: e.target.value })
            }
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
        <FormField label="Window end" required>
          <input
            type="time"
            value={form.slot_window_end}
            onChange={(e) =>
              setForm({ ...form, slot_window_end: e.target.value })
            }
            className="w-full px-3 py-2 rounded border bg-background"
          />
        </FormField>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCreated}>
          Cancel
        </Button>
        <LoadingButton
          isLoading={isLoading}
          loadingText="Creating..."
          onClick={submit}
          disabled={!form.name.trim()}
        >
          Create drop
        </LoadingButton>
      </div>
    </Card>
  );
}

interface DropCardProps {
  drop: Drop;
}

function DropCard({ drop }: DropCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{drop.name}</h2>
            <StatusBadge
              tone={STATUS_TONE[drop.status]}
              label={DROP_STATUS_LABELS[drop.status]}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {drop.date}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(drop.slot_window_start)}{" "}-{" "}
              {formatTime(drop.slot_window_end)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Pizza className="h-3.5 w-3.5" />
              {drop.slots.length} slot{drop.slots.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <DropActions drop={drop} />
      </div>
      <div className="mt-4">
        <SlotEditor drop={drop} />
      </div>
    </Card>
  );
}

interface DropActionsProps {
  drop: Drop;
}

function DropActions({ drop }: DropActionsProps) {
  const [updateDrop, { isLoading: isUpdating }] = useUpdateDropMutation();
  const [deleteDrop, { isLoading: isDeleting }] = useDeleteDropMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const setStatus = async (status: DropStatus) => {
    try {
      await updateDrop({ id: drop.id, body: { status } }).unwrap();
      showSuccess(`Drop ${DROP_STATUS_LABELS[status].toLowerCase()}`);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update drop");
    }
  };

  const onDelete = async () => {
    try {
      await deleteDrop(drop.id).unwrap();
      showSuccess("Drop deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete drop");
    }
  };

  if (drop.status === "closed") {
    return <span className="text-xs text-muted-foreground">Read-only</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {drop.status === "planning" ? (
        <>
          <LoadingButton
            size="sm"
            isLoading={isUpdating}
            loadingText="Activating..."
            onClick={() => setStatus("active")}
            disabled={drop.slots.length === 0}
            title={
              drop.slots.length === 0
                ? "Add at least one slot first"
                : "Open this drop for orders"
            }
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Activate
          </LoadingButton>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmCancel(true)}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        </>
      ) : null}
      {drop.status === "active" ? (
        <Button
          size="sm"
          onClick={() => setConfirmClose(true)}
        >
          Close drop
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title="Delete this drop?"
        description="The drop and all its slots will be removed. This can't be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
      <ConfirmDialog
        open={confirmCancel}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => setStatus("closed")}
        title="Cancel this drop?"
        description="The drop will be marked closed and can no longer be edited."
        confirmLabel="Yes, cancel"
        isLoading={isUpdating}
      />
      <ConfirmDialog
        open={confirmClose}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => setStatus("closed")}
        title="Close this drop?"
        description="Service is done. The drop will be finalized and locked for further edits."
        confirmLabel="Close drop"
        isLoading={isUpdating}
      />
    </div>
  );
}

interface SlotEditorProps {
  drop: Drop;
}

function SlotEditor({ drop }: SlotEditorProps) {
  const editable = drop.status !== "closed";
  const [showAddSlot, setShowAddSlot] = useState(false);

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Pickup slots</h3>
        {editable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAddSlot((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add slot
          </Button>
        ) : null}
      </div>
      {drop.slots.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No slots yet.{" "}
          {editable ? "Add at least one before activating." : ""}
        </p>
      ) : (
        <ul className="space-y-1">
          {drop.slots.map((slot) => (
            <SlotRow
              key={slot.id}
              dropId={drop.id}
              slot={slot}
              editable={editable}
            />
          ))}
        </ul>
      )}
      {showAddSlot && editable ? (
        <AddSlotForm
          dropId={drop.id}
          onDone={() => setShowAddSlot(false)}
        />
      ) : null}
    </div>
  );
}

interface SlotRowProps {
  dropId: string;
  slot: { id: string; pickup_time: string; max_pizzas: number };
  editable: boolean;
}

function SlotRow({ dropId, slot, editable }: SlotRowProps) {
  const [deleteSlot, { isLoading }] = useDeleteSlotMutation();
  const onDelete = async () => {
    try {
      await deleteSlot({ dropId, slotId: slot.id }).unwrap();
      showSuccess("Slot removed");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to remove slot");
    }
  };
  return (
    <li className="flex items-center justify-between gap-2 text-sm rounded px-2 py-1 hover:bg-muted/30">
      <span>
        {formatTime(slot.pickup_time)} -- {slot.max_pizzas} pizzas
      </span>
      {editable ? (
        <LoadingButton
          size="sm"
          variant="ghost"
          isLoading={isLoading}
          onClick={onDelete}
          aria-label="Remove slot"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </LoadingButton>
      ) : null}
    </li>
  );
}

interface AddSlotFormProps {
  dropId: string;
  onDone: () => void;
}

function AddSlotForm({ dropId, onDone }: AddSlotFormProps) {
  const [body, setBody] = useState<SlotCreateBody>({
    pickup_time: "12:00",
    max_pizzas: 6,
  });
  const [addSlot, { isLoading }] = useAddSlotMutation();

  const submit = async () => {
    try {
      await addSlot({
        dropId,
        body: { ...body, pickup_time: ensureSeconds(body.pickup_time) },
      }).unwrap();
      showSuccess("Slot added");
      onDone();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to add slot");
    }
  };

  return (
    <div className="flex items-end gap-2 mt-2">
      <FormField label="Pickup time">
        <input
          type="time"
          value={body.pickup_time}
          onChange={(e) => setBody({ ...body, pickup_time: e.target.value })}
          className="px-3 py-2 rounded border bg-background"
        />
      </FormField>
      <FormField label="Max pizzas">
        <input
          type="number"
          min={1}
          value={body.max_pizzas}
          onChange={(e) =>
            setBody({ ...body, max_pizzas: Number(e.target.value) || 0 })
          }
          className="px-3 py-2 rounded border bg-background w-24"
        />
      </FormField>
      <LoadingButton
        size="sm"
        isLoading={isLoading}
        loadingText="Adding..."
        onClick={submit}
        disabled={body.max_pizzas <= 0}
      >
        Add
      </LoadingButton>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureSeconds(t: string): string {
  // <input type="time"> emits "HH:MM"; backend wants "HH:MM:SS".
  return t.length === 5 ? `${t}:00` : t;
}

function formatTime(t: string): string {
  // "HH:MM:SS" -> "HH:MM"
  return t.length >= 5 ? t.slice(0, 5) : t;
}
