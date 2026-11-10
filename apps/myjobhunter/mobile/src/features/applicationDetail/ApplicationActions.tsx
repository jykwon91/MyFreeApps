import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import {
  useDeleteApplicationMutation,
  useTransitionApplicationMutation,
  useUpdateApplicationMutation,
} from "@myjobhunter/api-client/store/applicationsApi";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import { LoadingButton, OptionSheet, PickerField, useTheme, useToast } from "@platform/mobile";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { Alert, View } from "react-native";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../constants/applicationDetail";
import { STAGE_OPTIONS } from "../../constants/stageOptions";
import { writeFailure } from "../../lib/writeFailure";
import type { ApplicationAction } from "../../types/ApplicationAction";
import type { ApplicationActionsProps } from "../../types/ApplicationActionsProps";

/** The website's header actions: move to a stage, archive or restore, and delete after asking. */
export default function ApplicationActions({ application, column, isLeaving, onDeleted }: ApplicationActionsProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [transition] = useTransitionApplicationMutation();
  const [updateApplication] = useUpdateApplicationMutation();
  const [deleteApplication] = useDeleteApplicationMutation();
  const [isStageSheetOpen, setIsStageSheetOpen] = useState(false);
  const [busy, setBusy] = useState<ApplicationAction | null>(null);
  const { id, archived } = application;
  const isDisabled = busy !== null || isLeaving;

  async function run(action: ApplicationAction, work: () => Promise<unknown>, done: string, failed: string): Promise<boolean> {
    setBusy(action);
    try {
      await work();
      showToast(done);
      return true;
    } catch (error) {
      showToast(writeFailure(error, failed), "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function moveTo(target: KanbanColumn): Promise<void> {
    if (target === column) return;
    // A fresh key per move, as the website's board sends, so a retried request can't move it twice.
    await run("stage", () => transition({ applicationId: id, target_column: target, idempotency_key: randomUUID() }).unwrap(), `${MESSAGES.movedTo} ${KANBAN_COLUMN_LABELS[target]}.`, MESSAGES.couldntMove);
  }

  async function toggleArchive(): Promise<void> {
    await run(
      "archive",
      () => updateApplication({ id, patch: { archived: !archived } }).unwrap(),
      archived ? MESSAGES.restoredToast : MESSAGES.archivedToast,
      archived ? MESSAGES.couldntRestore : MESSAGES.couldntArchive,
    );
  }

  async function remove(): Promise<void> {
    if (await run("delete", () => deleteApplication(id).unwrap(), MESSAGES.deleted, MESSAGES.couldntDelete)) onDeleted();
  }

  function confirmDelete(): void {
    Alert.alert(MESSAGES.deleteTitle, MESSAGES.deleteBody, [
      { text: MESSAGES.keep, style: "cancel" },
      { text: MESSAGES.delete, style: "destructive", onPress: () => void remove() },
    ]);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <PickerField
        disabled={isDisabled}
        hint={MESSAGES.stageHint}
        label={MESSAGES.stage}
        onPress={() => setIsStageSheetOpen(true)}
        valueLabel={busy === "stage" ? MESSAGES.moving : KANBAN_COLUMN_LABELS[column]}
      />
      <LoadingButton
        disabled={isDisabled}
        isLoading={busy === "archive"}
        loadingText={archived ? MESSAGES.restoring : MESSAGES.archiving}
        onPress={toggleArchive}
        variant="secondary"
      >
        {archived ? MESSAGES.restore : MESSAGES.archive}
      </LoadingButton>
      <LoadingButton disabled={isDisabled} isLoading={busy === "delete"} loadingText={MESSAGES.deleting} onPress={confirmDelete} variant="destructive">
        {MESSAGES.delete}
      </LoadingButton>
      <OptionSheet
        isOpen={isStageSheetOpen}
        onClose={() => setIsStageSheetOpen(false)}
        onSelect={(target) => {
          setIsStageSheetOpen(false);
          void moveTo(target);
        }}
        options={STAGE_OPTIONS}
        title={MESSAGES.stageTitle}
        value={column}
      />
    </View>
  );
}
