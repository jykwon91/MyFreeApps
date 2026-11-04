import { useTheme } from "@platform/mobile";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import type { PeopleParams } from "../../types/PeopleParams";
import InquiriesScreen from "../inquiries/InquiriesScreen";
import { stageFromParam, viewFromParam } from "../inquiries/inquiryFilters";

export default function PeopleScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<PeopleParams>();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <InquiriesScreen
        onStageChange={(stage) => router.setParams({ stage: stage ?? undefined })}
        onViewChange={(view) => router.setParams({ view })}
        stage={stageFromParam(params.stage)}
        view={viewFromParam(params.view)}
      />
    </View>
  );
}
