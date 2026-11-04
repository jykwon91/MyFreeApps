import { SegmentedControl, useTheme } from "@platform/mobile";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { PEOPLE_SECTIONS } from "../../constants/people";
import type { PeopleParams } from "../../types/PeopleParams";
import type { PeopleSection } from "../../types/PeopleSection";
import { applicantStageFromParam } from "../applicants/applicantDisplay";
import ApplicantsScreen from "../applicants/ApplicantsScreen";
import InquiriesScreen from "../inquiries/InquiriesScreen";
import { stageFromParam, viewFromParam } from "../inquiries/inquiryFilters";

function sectionFromParam(param: string | undefined): PeopleSection {
  return PEOPLE_SECTIONS.find((section) => section.value === param)?.value ?? "inquiries";
}

export default function PeopleScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<PeopleParams>();
  const section = sectionFromParam(params.section);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <SegmentedControl
          accessibilityLabel="Inquiries or applicants"
          onChange={(next) => router.setParams({ section: next, stage: undefined, view: undefined })}
          segments={PEOPLE_SECTIONS}
          value={section}
        />
      </View>
      {section === "applicants" ? (
        <ApplicantsScreen
          onSeeInquiries={() => router.setParams({ section: "inquiries", stage: undefined, view: undefined })}
          onStageChange={(stage) => router.setParams({ stage: stage ?? undefined })}
          stage={applicantStageFromParam(params.stage)}
        />
      ) : (
        <InquiriesScreen
          onStageChange={(stage) => router.setParams({ stage: stage ?? undefined })}
          onViewChange={(view) => router.setParams({ view })}
          stage={stageFromParam(params.stage)}
          view={viewFromParam(params.view)}
        />
      )}
    </View>
  );
}
