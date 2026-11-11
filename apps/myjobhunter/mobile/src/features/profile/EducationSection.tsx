import type { Education } from "@myjobhunter/api-client/types/education/education";
import { useState } from "react";
import { EDUCATION_MESSAGES as MESSAGES } from "../../constants/profileEducation";
import type { ProfileSectionProps } from "../../types/ProfileSectionProps";
import type { ProfileSheetTarget } from "../../types/ProfileSheetTarget";
import EducationCard from "./EducationCard";
import EducationSheet from "./EducationSheet";
import ProfileListSection from "./ProfileListSection";

export default function EducationSection({ state }: ProfileSectionProps<Education>) {
  const [sheet, setSheet] = useState<ProfileSheetTarget<Education> | null>(null);
  return (
    <>
      <ProfileListSection
        addLabel={MESSAGES.add}
        couldntLoad={MESSAGES.couldntLoad}
        emptyBody={MESSAGES.noneBody}
        emptyHeading={MESSAGES.none}
        loadingLabel={MESSAGES.loading}
        onAdd={() => setSheet({})}
        renderItems={(items) => items.map((entry) => <EducationCard entry={entry} key={entry.id} onEdit={() => setSheet({ existing: entry })} />)}
        state={state}
        testID="profile-education"
        title={MESSAGES.title}
        tryAgain={MESSAGES.tryAgain}
      />
      {sheet ? <EducationSheet existing={sheet.existing} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
