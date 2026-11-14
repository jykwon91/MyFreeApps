import { ORGANIZATION_NAME_MAX_LENGTH, ORGANIZATION_NAME_PROBLEM_MESSAGES } from "@mybookkeeper/api-client/constants/organizationName";
import { organizationNameProblem } from "@mybookkeeper/api-client/utils/organizationNameProblem";
import { FormField, FormSheet, LoadingButton } from "@platform/mobile";
import { useRef, useState } from "react";
import { WORKSPACE_MESSAGES as MESSAGES } from "../../constants/workspace";
import type { CreateWorkspaceSheetProps } from "../../types/CreateWorkspaceSheetProps";

/** Names a new workspace. The website's form takes the same names, checked the same way. */
export default function CreateWorkspaceSheet({ onClose, onCreate }: CreateWorkspaceSheetProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const isSubmitting = useRef(false);

  function close(): void {
    if (!isCreating) onClose();
  }

  async function submit(): Promise<void> {
    if (isSubmitting.current) return;
    const problem = organizationNameProblem(name);
    if (problem) {
      setNameError(ORGANIZATION_NAME_PROBLEM_MESSAGES[problem]);
      return;
    }
    isSubmitting.current = true;
    setNameError(undefined);
    setFailure(null);
    setIsCreating(true);
    try {
      const outcome = await onCreate(name.trim());
      if (outcome) setFailure(outcome);
      else onClose();
    } finally {
      isSubmitting.current = false;
      setIsCreating(false);
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={close} title={MESSAGES.createTitle}>
      <FormField
        autoCapitalize="words"
        autoFocus
        editable={!isCreating}
        error={nameError}
        hint={MESSAGES.nameHint}
        label={MESSAGES.name}
        maxLength={ORGANIZATION_NAME_MAX_LENGTH}
        onChangeText={setName}
        onSubmitEditing={() => void submit()}
        placeholder={MESSAGES.namePlaceholder}
        required
        returnKeyType="done"
        value={name}
      />
      <LoadingButton isLoading={isCreating} loadingText={MESSAGES.creating} onPress={() => void submit()}>
        {MESSAGES.create}
      </LoadingButton>
      <LoadingButton disabled={isCreating} onPress={close} variant="ghost">
        {MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
