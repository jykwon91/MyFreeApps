import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";
import { useState } from "react";
import { WORK_HISTORY_MESSAGES as MESSAGES } from "../../constants/profileWorkHistory";
import type { ProfileSectionProps } from "../../types/ProfileSectionProps";
import type { ProfileSheetTarget } from "../../types/ProfileSheetTarget";
import ProfileListSection from "./ProfileListSection";
import WorkHistoryCard from "./WorkHistoryCard";
import WorkHistorySheet from "./WorkHistorySheet";

export default function WorkHistorySection({ state }: ProfileSectionProps<WorkHistory>) {
  const [sheet, setSheet] = useState<ProfileSheetTarget<WorkHistory> | null>(null);
  return (
    <>
      <ProfileListSection
        addLabel={MESSAGES.add}
        couldntLoad={MESSAGES.couldntLoad}
        emptyBody={MESSAGES.noneBody}
        emptyHeading={MESSAGES.none}
        loadingLabel={MESSAGES.loading}
        onAdd={() => setSheet({})}
        renderItems={(items) => items.map((entry) => <WorkHistoryCard entry={entry} key={entry.id} onEdit={() => setSheet({ existing: entry })} />)}
        state={state}
        testID="profile-work-history"
        title={MESSAGES.title}
        tryAgain={MESSAGES.tryAgain}
      />
      {sheet ? <WorkHistorySheet existing={sheet.existing} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
