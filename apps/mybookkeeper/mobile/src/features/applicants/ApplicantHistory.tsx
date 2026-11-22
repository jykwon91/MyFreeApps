import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import ApplicantActivity from "./ApplicantActivity";
import ApplicantReferences from "./ApplicantReferences";
import ApplicantVideoCalls from "./ApplicantVideoCalls";

export default function ApplicantHistory({ applicant }: { applicant: ApplicantDetailResponse }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <ApplicantReferences references={applicant.references} />
      <ApplicantVideoCalls calls={applicant.video_call_notes} />
      <ApplicantActivity events={applicant.events} />
    </View>
  );
}
