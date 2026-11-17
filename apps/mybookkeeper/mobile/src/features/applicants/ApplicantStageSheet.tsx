import { APPLICANT_STAGE_NOTE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/applicantStageNote";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { FormField, FormSheet, FormSheetCancelButton, LoadingButton, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { applicantStageLabel } from "./applicantDisplay";

export default function ApplicantStageSheet({
  isOpen,
  name,
  onClose,
  onMove,
  stage,
}: {
  isOpen: boolean;
  name: string;
  onClose: () => void;
  onMove: (stage: ApplicantStage, note: string) => Promise<string | null>;
  stage: ApplicantStage | null;
}) {
  const { colors, fontSize } = useTheme();
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  // Covers the re-read after a failure too, when a second tap could otherwise slip in.
  const [isMoving, setIsMoving] = useState(false);
  const isSubmitting = useRef(false);

  function close(): void {
    setNote("");
    setFailure(null);
    onClose();
  }

  async function submit(target: ApplicantStage): Promise<void> {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setIsMoving(true);
    setFailure(null);
    const problem = await onMove(target, note);
    isSubmitting.current = false;
    setIsMoving(false);
    if (problem) {
      setFailure(problem);
      return;
    }
    setNote("");
    onClose();
  }

  const stageLabel = stage ? applicantStageLabel(stage) : "";

  return (
    <FormSheet failure={failure} hasUnsavedChanges={note.trim() !== ""} isBusy={isMoving} isOpen={isOpen && stage !== null} onRequestClose={close} title={`Move to ${stageLabel}?`}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{name}</Text>
      <FormField
        editable={!isMoving}
        hint={`${note.length}/${APPLICANT_STAGE_NOTE_MAX_LENGTH}`}
        label="Note (optional)"
        maxLength={APPLICANT_STAGE_NOTE_MAX_LENGTH}
        multiline
        onChangeText={setNote}
        value={note}
      />
      <LoadingButton
        isLoading={isMoving}
        loadingText="Moving…"
        onPress={() => {
          if (stage) void submit(stage);
        }}
      >
        {`Move to ${stageLabel}`}
      </LoadingButton>
      <FormSheetCancelButton>Cancel</FormSheetCancelButton>
    </FormSheet>
  );
}
