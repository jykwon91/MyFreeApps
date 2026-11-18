import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import {
  useDeleteApplicationMutation,
  useTransitionApplicationMutation,
  useUpdateApplicationMutation,
} from "@myjobhunter/api-client/store/applicationsApi";
import { refetchAfterLostMove } from "@myjobhunter/api-client/store/refetchAfterLostMove";
import { useMoveKeys } from "@myjobhunter/api-client/hooks/useMoveKeys";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import { LoadingButton, OptionSheet, PickerField, useTheme, useToast } from "@platform/mobile";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { Alert, View } from "react-native";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../constants/applicationDetail";
import { STAGE_OPTIONS } from "../../constants/stageOptions";
import { moveFailure, writeFailure } from "../../lib/writeFailure";
import type { ApplicationAction } from "../../types/ApplicationAction";
import type { ApplicationActionsProps } from "../../types/ApplicationActionsProps";

/** The website's header actions: move to a stage, archive or restore, and delete after asking. */
export default function ApplicationActions({ application, column, isLeaving, onDeleted }: ApplicationActionsProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const moveKeys = useMoveKeys(randomUUID);
  const [transition] = useTransitionApplicationMutation();
  const [updateApplication] = useUpdateApplicationMutation();
  const [deleteApplication] = useDeleteApplicationMutation();
  const [isStageSheetOpen, setIsStageSheetOpen] = useState(false);
  const [busy, setBusy] = useState<ApplicationAction | null>(null);
  const { id, archived } = application;
  const isDisabled = busy !== null || isLeaving;

  async function run(
    action: ApplicationAction,
    work: () => Promise<unknown>,
    done: string,
    failed: string,
    describeFailure: (error: unknown) => string | null = (error) => writeFailure(error, failed),
  ): Promise<boolean> {
    setBusy(action);
    try {
      await work();
      showToast(done);
      return true;
    } catch (error) {
      const message = describeFailure(error);
      if (message) showToast(message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function moveTo(target: KanbanColumn): Promise<void> {
    if (target === column) return;
    const moved = await run(
      "stage",
      // The same move retried after a lost answer reuses its key, so the server counts it once.
      () => transition({ applicationId: id, target_column: target, idempotency_key: moveKeys.keyFor(id, target) }).unwrap().catch(settleMove),
      `${MESSAGES.movedTo} ${KANBAN_COLUMN_LABELS[target]}.`,
      MESSAGES.couldntMove,
      moveFailure,
    );
    if (moved) moveKeys.settle(id);
  }

  /** A lost answer leaves the stage unknown: read it again from the server and keep the key for a retry. Any other failure settles the move. */
  function settleMove(error: unknown): never {
    if (writeOutcome(error) === "unknown") dispatch(refetchAfterLostMove(id));
    else moveKeys.settle(id);
    throw error;
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
