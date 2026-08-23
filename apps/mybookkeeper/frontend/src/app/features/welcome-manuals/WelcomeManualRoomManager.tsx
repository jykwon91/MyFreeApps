import { useState } from "react";
import { DoorOpen, Plus, X } from "lucide-react";
import { LoadingButton, ConfirmDialog } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  NEW_ROOM_DEFAULT_NAME,
  WELCOME_MANUAL_MAX_ROOMS,
} from "@/shared/lib/welcome-manual-constants";
import {
  useCreateRoomMutation,
  useDeleteRoomMutation,
  useUpdateRoomMutation,
} from "@/shared/store/welcomeManualsApi";
import type { WelcomeManualRoomResponse } from "@/shared/types/welcome-manual/welcome-manual-room-response";

export interface WelcomeManualRoomManagerProps {
  manualId: string;
  rooms: WelcomeManualRoomResponse[];
  /** How many sections are scoped to each room, keyed by room id. */
  sectionCountByRoom: Map<string, number>;
}

const inputClass =
  "flex-1 min-w-0 border rounded-md px-2 py-2 text-sm min-h-[44px] bg-transparent focus:outline-none focus:bg-muted/40";

export default function WelcomeManualRoomManager({
  manualId,
  rooms,
  sectionCountByRoom,
}: WelcomeManualRoomManagerProps) {
  const [createRoom, { isLoading: isAdding }] = useCreateRoomMutation();
  const [updateRoom] = useUpdateRoomMutation();
  const [deleteRoom] = useDeleteRoomMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedRooms = [...rooms].sort((a, b) => a.display_order - b.display_order);
  const atCap = sortedRooms.length >= WELCOME_MANUAL_MAX_ROOMS;
  const roomPendingDelete = sortedRooms.find((r) => r.id === confirmDeleteId);
  const sectionsLost = roomPendingDelete
    ? (sectionCountByRoom.get(roomPendingDelete.id) ?? 0)
    : 0;

  async function handleAdd() {
    if (atCap) return;
    try {
      await createRoom({ manualId, data: { name: NEW_ROOM_DEFAULT_NAME } }).unwrap();
    } catch {
      showError("I couldn't add that room. Want to try again?");
    }
  }

  async function handleRename(roomId: string, name: string) {
    if (name === "") return;
    try {
      await updateRoom({ manualId, roomId, data: { name } }).unwrap();
    } catch {
      showError("I couldn't rename that room. Want to try again?");
    }
  }

  async function handleConfirmDelete() {
    const roomId = confirmDeleteId;
    if (!roomId) return;
    setConfirmDeleteId(null);
    try {
      await deleteRoom({ manualId, roomId }).unwrap();
      showSuccess("Room removed.");
    } catch {
      showError("I couldn't remove that room. Want to try again?");
    }
  }

  return (
    <section
      className="border rounded-lg p-4 space-y-3 bg-card"
      data-testid="welcome-manual-room-manager"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <DoorOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Rooms
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Renting this place by the room? Add one room per tenant. Sections stay
            shared unless you mark them for a single room — then only that room's
            emailed guide includes them.
          </p>
        </div>
        <LoadingButton
          variant="secondary"
          size="sm"
          onClick={() => void handleAdd()}
          isLoading={isAdding}
          loadingText="Adding..."
          disabled={atCap}
          data-testid="welcome-manual-room-add-button"
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Add room
        </LoadingButton>
      </div>

      {atCap ? (
        <p className="text-xs text-muted-foreground" data-testid="welcome-manual-room-cap">
          That's the limit of {WELCOME_MANUAL_MAX_ROOMS} rooms for one guide.
        </p>
      ) : null}

      {sortedRooms.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="welcome-manual-room-empty-state"
        >
          No rooms yet — this guide goes out whole, exactly as it does today.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="welcome-manual-room-list">
          {sortedRooms.map((room) => {
            const count = sectionCountByRoom.get(room.id) ?? 0;
            return (
              <li
                key={room.id}
                className="flex items-center gap-2"
                data-testid="welcome-manual-room-card"
                data-room-id={room.id}
              >
                {/* Uncontrolled + keyed on the server value, matching the place
                    and field cards: edits live in the DOM and save on blur. */}
                <input
                  key={`room-${room.name}`}
                  defaultValue={room.name}
                  onBlur={(e) => {
                    const trimmed = e.target.value.trim();
                    if (trimmed === room.name) return;
                    void handleRename(room.id, trimmed);
                  }}
                  placeholder="Room name"
                  className={inputClass}
                  aria-label="Room name"
                  data-testid="welcome-manual-room-name"
                />
                <span
                  className="text-xs text-muted-foreground whitespace-nowrap"
                  data-testid="welcome-manual-room-section-count"
                >
                  {count === 1 ? "1 section" : `${count} sections`}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(room.id)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-red-600"
                  aria-label={`Remove ${room.name}`}
                  data-testid="welcome-manual-room-delete"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Remove this room?"
        description={
          sectionsLost > 0
            ? `${sectionsLost === 1 ? "1 section" : `${sectionsLost} sections`} written only for this room will be deleted with it. Shared sections stay.`
            : "Shared sections stay — only this room goes."
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </section>
  );
}
