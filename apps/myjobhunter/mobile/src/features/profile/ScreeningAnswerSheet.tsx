import { SCREENING_ANSWER_MAX_LENGTH } from "@myjobhunter/api-client/constants/profileFieldLimits";
import { useCreateScreeningAnswerMutation, useUpdateScreeningAnswerMutation } from "@myjobhunter/api-client/store/screeningAnswersApi";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { isConflict } from "@myjobhunter/api-client/utils/isConflict";
import { screeningAnswerProblem } from "@myjobhunter/api-client/utils/screeningAnswerProblem";
import { screeningQuestionLabel } from "@myjobhunter/api-client/utils/screeningQuestionLabel";
import { unansweredScreeningQuestions } from "@myjobhunter/api-client/utils/unansweredScreeningQuestions";
import { ChoiceGroup, FormField, FormSheet, FormSheetCancelButton, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { SCREENING_MESSAGES as MESSAGES } from "../../constants/profileScreening";
import { createFailure, writeFailure } from "../../lib/writeFailure";
import type { ScreeningAnswerSheetProps } from "../../types/ScreeningAnswerSheetProps";
import SheetButtons from "../../components/forms/SheetButtons";

/**
 * Adding picks a question first, from those not answered yet, then takes the answer; editing goes
 * straight to the answer, as a question can't change once answered. Both happen in this one sheet,
 * so no second sheet has to open over it.
 */
export default function ScreeningAnswerSheet({ existing, answeredKeys, onClose }: ScreeningAnswerSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [createAnswer, created] = useCreateScreeningAnswerMutation();
  const [updateAnswer, updated] = useUpdateScreeningAnswerMutation();
  const isSaving = created.isLoading || updated.isLoading;
  const [questionKey, setQuestionKey] = useState(existing?.question_key ?? "");
  const [answer, setAnswer] = useState(existing?.answer ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const problem = screeningAnswerProblem(answer);
  // Changing the question keeps the answer, so the picker can have something to lose too.
  const hasUnsavedChanges = answer.trim() !== (existing?.answer ?? "").trim() || questionKey !== (existing?.question_key ?? "");
  const unanswered = unansweredScreeningQuestions(answeredKeys);
  const choices = (eeoc: boolean) => unanswered.filter((question) => question.eeoc === eeoc).map(({ key, label }) => ({ value: key, label }));

  // A 409 means this question was answered meanwhile (another device, or a double tap).
  const createdFailure = (error: unknown) =>
    isConflict(error) ? MESSAGES.alreadyAnswered : createFailure(error, { failed: MESSAGES.couldntCreate, checkWhere: MESSAGES.checkWhere });

  async function save(): Promise<void> {
    if (problem) return;
    setFailure(null);
    const text = answer.trim() || null;
    try {
      if (existing) await updateAnswer({ id: existing.id, patch: { answer: text } }).unwrap();
      else await createAnswer({ question_key: questionKey, answer: text }).unwrap();
      showToast(existing ? MESSAGES.updated : MESSAGES.created);
      onClose();
    } catch (error) {
      setFailure(existing ? writeFailure(error, MESSAGES.couldntUpdate, PROFILE_MESSAGES.gone) : createdFailure(error));
    }
  }

  const title = existing ? MESSAGES.editTitle : MESSAGES.addTitle;
  if (!questionKey) {
    const standard = choices(false);
    const eeoc = choices(true);
    return (
      <FormSheet hasUnsavedChanges={hasUnsavedChanges} isOpen onRequestClose={onClose} title={title}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.chooseIntro}</Text>
        {standard.length > 0 ? <ChoiceGroup label={MESSAGES.standard} onChange={setQuestionKey} options={standard} value="" /> : null}
        {eeoc.length > 0 ? <ChoiceGroup label={MESSAGES.eeoc} onChange={setQuestionKey} options={eeoc} value="" /> : null}
        <FormSheetCancelButton>{PROFILE_MESSAGES.cancel}</FormSheetCancelButton>
      </FormSheet>
    );
  }

  return (
    <FormSheet failure={failure} hasUnsavedChanges={hasUnsavedChanges} isBusy={isSaving} isOpen onRequestClose={onClose} title={title}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>{MESSAGES.questionLabel}</Text>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{screeningQuestionLabel(questionKey)}</Text>
      </View>
      {existing ? null : (
        <LoadingButton disabled={isSaving} onPress={() => setQuestionKey("")} variant="ghost">
          {MESSAGES.changeQuestion}
        </LoadingButton>
      )}
      <FormField
        autoFocus
        counter={characterCounter(answer.trim(), SCREENING_ANSWER_MAX_LENGTH)}
        editable={!isSaving}
        error={problem}
        label={MESSAGES.answerLabel}
        multiline
        onChangeText={setAnswer}
        placeholder={MESSAGES.answerPlaceholder}
        value={answer}
      />
      <SheetButtons
        cancelLabel={PROFILE_MESSAGES.cancel}
        isSubmitting={isSaving}
        onSubmit={save}
        submitLabel={existing ? PROFILE_MESSAGES.saveChanges : MESSAGES.create}
        submittingLabel={existing ? PROFILE_MESSAGES.saving : MESSAGES.creating}
      />
    </FormSheet>
  );
}
