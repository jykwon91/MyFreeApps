import { TENANCY_END_REASON_MAX_LENGTH } from "@mybookkeeper/api-client/constants/tenancy";
import { FormField, FormSheet, FormSheetCancelButton, LoadingButton, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { endTitle, TENANT_MESSAGES } from "../../constants/tenants";

export default function EndTenancySheet({
  isOpen,
  name,
  onClose,
  onEnd,
}: {
  isOpen: boolean;
  name: string;
  onClose: () => void;
  /** The problem to show here, or null if the sheet can close. */
  onEnd: (reason: string | null) => Promise<string | null>;
}) {
  const { colors, fontSize } = useTheme();
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const isSubmitting = useRef(false);

  function close(): void {
    setReason("");
    setFailure(null);
    onClose();
  }

  async function submit(): Promise<void> {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setIsEnding(true);
    setFailure(null);
    const problem = await onEnd(reason.trim() || null);
    isSubmitting.current = false;
    setIsEnding(false);
    if (problem) {
      setFailure(problem);
      return;
    }
    setReason("");
    onClose();
  }

  return (
    <FormSheet failure={failure} hasUnsavedChanges={reason.trim() !== ""} isBusy={isEnding} isOpen={isOpen} onRequestClose={close} title={endTitle(name)}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{TENANT_MESSAGES.endBody}</Text>
      <FormField
        editable={!isEnding}
        hint={`${reason.length}/${TENANCY_END_REASON_MAX_LENGTH}`}
        inputStyle={{ minHeight: 96, textAlignVertical: "top" }}
        label={TENANT_MESSAGES.reason}
        maxLength={TENANCY_END_REASON_MAX_LENGTH}
        multiline
        onChangeText={setReason}
        value={reason}
      />
      <LoadingButton isLoading={isEnding} loadingText={TENANT_MESSAGES.ending} onPress={() => void submit()} variant="destructive">
        {TENANT_MESSAGES.end}
      </LoadingButton>
      <FormSheetCancelButton>{TENANT_MESSAGES.cancel}</FormSheetCancelButton>
    </FormSheet>
  );
}
