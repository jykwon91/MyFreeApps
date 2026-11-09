import { WELCOME_MANUAL_ROOM_NAME_MAX_LENGTH } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { useCreateRoomMutation, useDeleteRoomMutation, useUpdateRoomMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualRoomFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-room-form-values";
import type { WelcomeManualRoomResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-room-response";
import { roomProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { FormField } from "@platform/mobile";
import { WELCOME_MANUAL_ROOM_MESSAGES as MESSAGES, deleteRoomTitle } from "../../constants/welcomeManualForms";
import { useSnapshotForm } from "../../lib/useSnapshotForm";
import WelcomeManualEditSheet from "./WelcomeManualEditSheet";
import { useWelcomeManualItemWrites } from "./useWelcomeManualItemWrites";
import { ROOM_WORDS, ROOM_SHEET_LABELS } from "../../constants/welcomeManualSheets";

interface WelcomeManualRoomSheetProps {
  manualId: string;
  /** null adds a room. */
  room: WelcomeManualRoomResponse | null;
  onClose: () => void;
}

export default function WelcomeManualRoomSheet({ manualId, room, onClose }: WelcomeManualRoomSheetProps) {
  const [createRoom] = useCreateRoomMutation();
  const [updateRoom] = useUpdateRoomMutation();
  const [deleteRoom] = useDeleteRoomMutation();
  const form = useSnapshotForm<WelcomeManualRoomFormValues>(() => ({ name: room?.name ?? "" }), roomProblems);
  const writes = useWelcomeManualItemWrites({
    words: ROOM_WORDS,
    isNew: room === null,
    hasChanges: form.isDirty,
    messages: { added: MESSAGES.added, saved: MESSAGES.saved, deleted: MESSAGES.deleted, alreadyDeleted: MESSAGES.alreadyDeleted },
    create: () => createRoom({ manualId, data: { name: form.values.name.trim() } }).unwrap(),
    update: () => updateRoom({ manualId, roomId: room?.id ?? "", data: { name: form.values.name.trim() } }).unwrap(),
    remove: () => deleteRoom({ manualId, roomId: room?.id ?? "" }).unwrap(),
    onDone: onClose,
  });

  return (
    <WelcomeManualEditSheet
      confirmDelete={{ title: deleteRoomTitle(room?.name ?? ""), body: MESSAGES.sectionsGoToo }}
      failure={writes.failure}
      isBusy={writes.isBusy}
      isDeleting={writes.isDeleting}
      isDirty={form.isDirty}
      isNew={room === null}
      isSaving={writes.isSaving}
      labels={ROOM_SHEET_LABELS}
      onClose={onClose}
      onDelete={() => void writes.destroy()}
      onSave={() => { if (form.validate()) void writes.save(); }}
      title={room ? MESSAGES.edit : MESSAGES.add}
    >
      <FormField editable={!writes.isBusy} error={form.errorFor("name")} label={MESSAGES.nameLabel} maxLength={WELCOME_MANUAL_ROOM_NAME_MAX_LENGTH} onChangeText={(text) => form.edit("name", text)} required value={form.values.name} />
    </WelcomeManualEditSheet>
  );
}
