import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";
import { unansweredScreeningQuestions } from "@myjobhunter/api-client/utils/unansweredScreeningQuestions";
import { useTheme } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import { SCREENING_MESSAGES as MESSAGES } from "../../constants/profileScreening";
import type { ProfileSectionProps } from "../../types/ProfileSectionProps";
import type { ProfileSheetTarget } from "../../types/ProfileSheetTarget";
import ProfileListSection from "./ProfileListSection";
import ScreeningAnswerGroup from "./ScreeningAnswerGroup";
import ScreeningAnswerSheet from "./ScreeningAnswerSheet";

/** Pre-filled answers, standard questions apart from EEOC ones, as on the website. */
export default function ScreeningAnswersSection({ state }: ProfileSectionProps<ScreeningAnswer>) {
  const { spacing } = useTheme();
  const [sheet, setSheet] = useState<ProfileSheetTarget<ScreeningAnswer> | null>(null);
  const answeredKeys = (state.items ?? []).map(({ question_key }) => question_key);
  const isAllAnswered = unansweredScreeningQuestions(answeredKeys).length === 0;
  const edit = (answer: ScreeningAnswer) => setSheet({ existing: answer });
  return (
    <>
      <ProfileListSection
        addDisabledReason={isAllAnswered ? MESSAGES.allAnswered : undefined}
        addLabel={MESSAGES.add}
        couldntLoad={MESSAGES.couldntLoad}
        emptyBody={MESSAGES.noneBody}
        emptyHeading={MESSAGES.none}
        loadingLabel={MESSAGES.loading}
        onAdd={() => setSheet({})}
        renderItems={(items) => (
          <View style={{ gap: spacing.lg }}>
            <ScreeningAnswerGroup answers={items.filter(({ is_eeoc }) => !is_eeoc)} onEdit={edit} title={MESSAGES.standard} />
            <ScreeningAnswerGroup answers={items.filter(({ is_eeoc }) => is_eeoc)} onEdit={edit} title={MESSAGES.eeoc} />
          </View>
        )}
        state={state}
        testID="profile-screening"
        title={MESSAGES.title}
        tryAgain={MESSAGES.tryAgain}
      />
      {sheet ? <ScreeningAnswerSheet answeredKeys={answeredKeys} existing={sheet.existing} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
